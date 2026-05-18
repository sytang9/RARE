import express from 'express';
import type { Request, Response } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initAnthropic } from './src/llm/anthropic.js';
import { createQueue, type QueueBackend } from './src/ingest/queue.js';
import { ingestSource } from './src/ingest/orchestrate.js';
import { runWorkerOnce } from './src/ingest/worker.js';
import { answer } from './src/chat/answer.js';
import { runLint } from './src/lint/run.js';
import { maybeRunLint } from './src/lint/scheduler.js';
import { initVault } from './src/vault/templates.js';
import { sha256 } from './src/lib/sha256.js';
import { htmlToMarkdown } from './src/sources/url.js';
import { isConfluenceUrl, fetchConfluencePage } from './src/sources/confluence.js';
import { pdfToMarkdown } from './src/sources/pdf.js';
import { writeFileText, readFileText } from './src/lib/fs.js';
import { sumLogCosts, parseCostLog } from './src/lib/cost.js';
import { buildGraph } from './src/vault/graph.js';
import { listPages, readPage } from './src/vault/page.js';
import { removeFromIndex } from './src/vault/indexFile.js';
import { chat as llmChat } from './src/llm/anthropic.js';
import { readFileSync } from 'node:fs';
import type { ChatOptions } from './src/llm/anthropic.js';

// --- env validation ---
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required');

const VAULTS_ROOT = resolvePath(
  process.env.VAULT_PATH ?? join(fileURLToPath(new URL('.', import.meta.url)), 'vault'),
);
const PORT = Number(process.env.PORT ?? 3100);

initAnthropic(API_KEY);

// ── Global config DB ─────────────────────────────────────────────────────────

const CONFIG_DIR = join(VAULTS_ROOT, '.config');
mkdirSync(CONFIG_DIR, { recursive: true });

const globalDb = new BetterSqlite3(join(CONFIG_DIR, 'config.sqlite'));
globalDb.pragma('foreign_keys = ON');
globalDb.exec(`
  CREATE TABLE IF NOT EXISTS vaults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

interface VaultRow { id: number; name: string; slug: string; created_at: string; updated_at: string; }

function getActiveVaultId(): number | null {
  const row = globalDb.prepare('SELECT value FROM global_settings WHERE key = ?').get('active_vault_id') as { value: string } | undefined;
  return row ? Number(row.value) : null;
}

function setActiveVaultId(id: number): void {
  globalDb.prepare('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)').run('active_vault_id', String(id));
}

// ── Migration: single-vault → multi-vault ────────────────────────────────────

async function migrateSingleVault(): Promise<void> {
  // If purpose.md is directly in VAULTS_ROOT, it's the old single-vault layout.
  // Move it into VAULTS_ROOT/default/ and register it.
  const legacyPurpose = join(VAULTS_ROOT, 'purpose.md');
  if (!existsSync(legacyPurpose)) return;

  console.log('Migrating single-vault layout to multi-vault...');
  const defaultDir = join(VAULTS_ROOT, 'default');
  mkdirSync(defaultDir, { recursive: true });

  const items = ['purpose.md', 'schema.md', 'raw', 'wiki', '.rare', '.obsidian'];
  for (const item of items) {
    const src = join(VAULTS_ROOT, item);
    const dst = join(defaultDir, item);
    if (existsSync(src) && !existsSync(dst)) {
      renameSync(src, dst);
    }
  }

  // Register in global DB if not already there
  const existing = globalDb.prepare("SELECT id FROM vaults WHERE slug = 'default'").get();
  if (!existing) {
    const r = globalDb.prepare('INSERT INTO vaults (name, slug) VALUES (?, ?)').run('Default', 'default');
    setActiveVaultId(r.lastInsertRowid as number);
  }
  console.log('Migration complete: data is now at ' + defaultDir);
}

await migrateSingleVault();

// ── Vault bootstrapping ──────────────────────────────────────────────────────

function vaultDirFor(slug: string): string {
  return join(VAULTS_ROOT, slug);
}

function ensureDefaultVaultExists(): number {
  const vaults = globalDb.prepare('SELECT id, slug FROM vaults').all() as VaultRow[];
  if (vaults.length === 0) {
    const r = globalDb.prepare('INSERT INTO vaults (name, slug) VALUES (?, ?)').run('Default', 'default');
    const id = r.lastInsertRowid as number;
    setActiveVaultId(id);
    return id;
  }
  const activeId = getActiveVaultId();
  if (activeId) return activeId;
  setActiveVaultId(vaults[0].id);
  return vaults[0].id;
}

const firstActiveId = ensureDefaultVaultExists();

// ── Per-vault DB + queue (mutable active state) ──────────────────────────────

interface ActiveVault {
  id: number;
  slug: string;
  root: string;
  db: BetterSqlite3.Database;
  queue: ReturnType<typeof createQueue>;
  queueBackend: QueueBackend;
}

function openVaultDb(slug: string): BetterSqlite3.Database {
  const dir = join(vaultDirFor(slug), '.rare');
  mkdirSync(dir, { recursive: true });
  const db = new BetterSqlite3(join(dir, 'queue.sqlite'));
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_queue_status ON ingest_queue (status);
    CREATE TABLE IF NOT EXISTS analyze_cache (
      sha256 TEXT PRIMARY KEY,
      analyze_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages (chat_id);
  `);
  return db;
}

function makeActive(id: number): ActiveVault {
  const row = globalDb.prepare('SELECT id, name, slug FROM vaults WHERE id = ?').get(id) as VaultRow;
  if (!row) throw new Error(`Vault id=${id} not found`);
  const root = vaultDirFor(row.slug);
  mkdirSync(root, { recursive: true });
  const db = openVaultDb(row.slug);
  const queueBackend: QueueBackend = {
    execute: (sql: string, params: unknown[] = []) => db.prepare(sql).run(...(params as Parameters<typeof db.prepare>[0][])),
    select: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as Parameters<typeof db.prepare>[0][])) as T,
  };
  return { id, slug: row.slug, root, db, queue: createQueue(queueBackend), queueBackend };
}

let active = makeActive(firstActiveId);

async function initActiveVault(): Promise<void> {
  const vault = { root: active.root };
  await initVault(vault);
  await active.queue.recoverInFlight();
  triggerWorker();
  const { lint_interval_hours } = dbGetSettings();
  maybeRunLint(vault, lint_interval_hours).catch((err) =>
    console.warn('Lint on startup skipped:', String(err)),
  );
}

// ── Settings helpers ─────────────────────────────────────────────────────────

interface SettingsRow { key: string; value: string; }
interface SettingsShape {
  cost_ceiling_usd: number;
  lint_interval_hours: number;
  confluence_base_url: string;
  confluence_email: string;
  confluence_api_token: string;
}
const SETTINGS_DEFAULTS: SettingsShape = {
  cost_ceiling_usd: 10,
  lint_interval_hours: 24,
  confluence_base_url: '',
  confluence_email: '',
  confluence_api_token: '',
};

function dbGetSettings(): SettingsShape {
  const rows = active.db.prepare('SELECT key, value FROM settings').all() as SettingsRow[];
  const out = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (r.key in SETTINGS_DEFAULTS) (out as Record<string, unknown>)[r.key] = r.key === 'cost_ceiling_usd' || r.key === 'lint_interval_hours' ? Number(r.value) : r.value;
  }
  return out;
}

function dbUpdateSettings(patch: Partial<SettingsShape>): void {
  const stmt = active.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(patch)) stmt.run(k, String(v));
}

// ── Worker ───────────────────────────────────────────────────────────────────

let workerRunning = false;

function triggerWorker() {
  if (workerRunning) return;
  workerRunning = true;
  runWorkerOnce(active.queue, (srcPath) => ingestSource({ root: active.root }, srcPath))
    .catch((err) => console.error('Worker error:', err))
    .finally(() => { workerRunning = false; });
}

// ── Startup ──────────────────────────────────────────────────────────────────

await initActiveVault();

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
}

// ── Vault management routes ──────────────────────────────────────────────────

app.get('/api/vaults', (_req: Request, res: Response) => {
  try {
    const vaults = globalDb.prepare('SELECT id, name, slug, created_at, updated_at FROM vaults ORDER BY id ASC').all() as VaultRow[];
    const activeId = getActiveVaultId();
    res.json({
      vaults: vaults.map(v => ({ ...v, isActive: v.id === activeId })),
      activeVaultId: activeId,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/vaults', async (req: Request, res: Response) => {
  try {
    const { name, slug } = req.body as { name?: string; slug?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const safeSlug = (slug ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vault';

    // Check uniqueness
    const exists = globalDb.prepare('SELECT id FROM vaults WHERE slug = ?').get(safeSlug);
    if (exists) return res.status(409).json({ error: `Vault slug "${safeSlug}" already exists` });

    const dir = vaultDirFor(safeSlug);
    mkdirSync(dir, { recursive: true });

    const r = globalDb.prepare('INSERT INTO vaults (name, slug) VALUES (?, ?)').run(name.trim(), safeSlug);
    const vaultId = r.lastInsertRowid as number;

    // Initialize vault files (purpose.md, schema.md, obsidian config)
    await initVault({ root: dir });

    // Switch to new vault immediately
    setActiveVaultId(vaultId);
    active = makeActive(vaultId);
    await active.queue.recoverInFlight();

    const newVault = globalDb.prepare('SELECT id, name, slug, created_at, updated_at FROM vaults WHERE id = ?').get(vaultId) as VaultRow;
    res.json({ ...newVault, isActive: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/vaults/:id/activate', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = globalDb.prepare('SELECT id FROM vaults WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Vault not found' });

    setActiveVaultId(id);
    active = makeActive(id);
    await initVault({ root: active.root });
    await active.queue.recoverInFlight();
    triggerWorker();
    const { lint_interval_hours } = dbGetSettings();
    maybeRunLint({ root: active.root }, lint_interval_hours).catch(() => {/* non-fatal */});

    res.json({ ok: true, activeVaultId: id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/vaults/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const vaults = globalDb.prepare('SELECT id, slug FROM vaults').all() as VaultRow[];
    if (vaults.length <= 1) return res.status(400).json({ error: 'Cannot delete the only vault' });

    const vault = vaults.find(v => v.id === id);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });

    // If deleting the active vault, switch to another first
    if (getActiveVaultId() === id) {
      const other = vaults.find(v => v.id !== id)!;
      setActiveVaultId(other.id);
      active = makeActive(other.id);
    }

    // Remove directory and DB record
    const { rm } = await import('node:fs/promises');
    const dir = vaultDirFor(vault.slug);
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    globalDb.prepare('DELETE FROM vaults WHERE id = ?').run(id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/vaults/:id/generate-purpose', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { description, questions } = req.body as { description?: string; questions?: string };
    if (!description?.trim()) return res.status(400).json({ error: 'description required' });

    const promptTemplate = readFileSync(join(__dirname, 'prompts', 'purpose-generate.md'), 'utf-8');
    const prompt = promptTemplate
      .replace('{{description}}', description.trim())
      .replace('{{questions}}', (questions ?? '').trim() || 'None specified');

    const chatOpts: ChatOptions = {
      model: 'haiku',
      system: 'You write clean, structured markdown for configuration files.',
      messages: [{ role: 'user', content: prompt }],
    };
    const result = await llmChat(chatOpts);
    const purpose = result.text;

    // Write purpose.md to the target vault
    const row = globalDb.prepare('SELECT slug FROM vaults WHERE id = ?').get(id) as VaultRow | undefined;
    if (!row) return res.status(404).json({ error: 'Vault not found' });
    const purposePath = join(vaultDirFor(row.slug), 'purpose.md');
    await writeFileText(purposePath, purpose);

    res.json({ purpose });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Health + settings ────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/settings', async (_req: Request, res: Response) => {
  try {
    const s = dbGetSettings();
    let monthly = 0;
    try {
      const log = await readFileText(join(active.root, 'wiki', 'log.md'));
      monthly = sumLogCosts(log, new Date().toISOString().slice(0, 7));
    } catch { /* no log yet */ }
    // Mask api token in response
    const safe = { ...s, confluence_api_token: s.confluence_api_token ? '***' : '' };
    res.json({ ...safe, vault_path: active.root, monthly_cost_usd: monthly });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/settings', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const patch: Partial<SettingsShape> = {};
    if (body.cost_ceiling_usd !== undefined) patch.cost_ceiling_usd = Number(body.cost_ceiling_usd);
    if (body.lint_interval_hours !== undefined) patch.lint_interval_hours = Number(body.lint_interval_hours);
    if (body.confluence_base_url !== undefined) patch.confluence_base_url = String(body.confluence_base_url);
    if (body.confluence_email !== undefined) patch.confluence_email = String(body.confluence_email);
    // Only update token if a real value is provided (not the masked placeholder)
    if (body.confluence_api_token !== undefined && body.confluence_api_token !== '***') {
      patch.confluence_api_token = String(body.confluence_api_token);
    }
    dbUpdateSettings(patch);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Ingest ───────────────────────────────────────────────────────────────────

app.post('/api/ingest/url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url) return res.status(400).json({ error: 'url required' });

    let title: string;
    let markdown: string;

    if (isConfluenceUrl(url)) {
      const s = dbGetSettings();
      if (!s.confluence_base_url || !s.confluence_email || !s.confluence_api_token) {
        return res.status(400).json({ error: 'Confluence credentials not configured. Add them in Settings.' });
      }
      const result = await fetchConfluencePage(url, {
        baseUrl: s.confluence_base_url,
        email: s.confluence_email,
        apiToken: s.confluence_api_token,
      });
      title = result.title;
      markdown = result.markdown;
    } else {
      const resp = await fetch(url);
      if (!resp.ok) return res.status(400).json({ error: `Fetch failed: ${resp.statusText}` });
      const html = await resp.text();
      const result = await htmlToMarkdown(html, url);
      title = result.title;
      markdown = result.markdown;
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
    const rawPath = `raw/sources/${slug}.md`;
    await writeFileText(join(active.root, rawPath), markdown);

    const hash = sha256(markdown);
    try {
      const task = await active.queue.enqueue(rawPath, hash);
      triggerWorker();
      res.json({ jobId: task.id });
    } catch {
      const existing = active.queueBackend.select<{ id: number; status: string }[]>(
        'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
      );
      res.json({ jobId: existing[0]?.id ?? 0, cached: true });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/ingest/path', async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.body as { path?: string };
    if (!filePath) return res.status(400).json({ error: 'path required' });
    const absPath = resolvePath(filePath);

    let rawPath: string;
    let content: string;

    if (absPath.endsWith('.pdf')) {
      content = await pdfToMarkdown(absPath);
      const slug = absPath.split('/').pop()!.replace(/\.pdf$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      rawPath = `raw/sources/${slug}.md`;
    } else {
      content = await readFileText(absPath);
      rawPath = `raw/sources/${absPath.split('/').pop()!}`;
    }
    await writeFileText(join(active.root, rawPath), content);

    const hash = sha256(content);
    try {
      const task = await active.queue.enqueue(rawPath, hash);
      triggerWorker();
      res.json({ jobId: task.id });
    } catch {
      const existing = active.queueBackend.select<{ id: number; status: string }[]>(
        'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
      );
      res.json({ jobId: existing[0]?.id ?? 0, cached: true });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/ingest/upload', express.raw({ type: 'application/pdf', limit: '50mb' }), async (req: Request, res: Response) => {
  try {
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: 'PDF body required (Content-Type: application/pdf)' });
    }
    const visionPdf = req.query.visionPdf === 'true';
    const filename = ((req.headers['x-filename'] as string) ?? 'upload.pdf').replace(/[/\\]/g, '');
    const slug = filename.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';

    if (visionPdf) {
      const rawPath = `raw/sources/${slug}.pdf`;
      const destPath = join(active.root, rawPath);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(destPath, buffer);
      const hash = sha256(buffer.toString('base64'));
      try {
        const task = await active.queue.enqueue(rawPath, hash);
        triggerWorker();
        res.json({ jobId: task.id });
      } catch {
        const existing = active.queueBackend.select<{ id: number; status: string }[]>(
          'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
        );
        res.json({ jobId: existing[0]?.id ?? 0, cached: true });
      }
    } else {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const parseResult = await parser.getText();
      await parser.destroy();
      const text = parseResult.text;
      if (!text.trim()) return res.status(422).json({ error: 'No text extracted from PDF' });
      const rawPath = `raw/sources/${slug}.md`;
      await writeFileText(join(active.root, rawPath), text);
      const hash = sha256(text);
      try {
        const task = await active.queue.enqueue(rawPath, hash);
        triggerWorker();
        res.json({ jobId: task.id });
      } catch {
        const existing = active.queueBackend.select<{ id: number; status: string }[]>(
          'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
        );
        res.json({ jobId: existing[0]?.id ?? 0, cached: true });
      }
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/queue', async (_req: Request, res: Response) => {
  try {
    res.json(await active.queue.list());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Chat ─────────────────────────────────────────────────────────────────────

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { query, history, model: rawModel, thinking: rawThinking, chatId: rawChatId } = req.body as {
      query?: string;
      history?: unknown[];
      model?: string;
      thinking?: boolean;
      chatId?: number;
    };
    if (!query) return res.status(400).json({ error: 'query required' });
    const VALID_MODELS = ['haiku', 'sonnet', 'opus'] as const;
    const model = VALID_MODELS.includes(rawModel as typeof VALID_MODELS[number])
      ? (rawModel as typeof VALID_MODELS[number])
      : 'sonnet';
    const thinking = rawThinking === true;

    let chatId: number;
    if (rawChatId) {
      const existing = active.db.prepare('SELECT id FROM chats WHERE id = ?').get(rawChatId);
      if (existing) {
        chatId = rawChatId;
      } else {
        const r = active.db.prepare('INSERT INTO chats (title) VALUES (?)').run(query.slice(0, 60));
        chatId = r.lastInsertRowid as number;
      }
    } else {
      const r = active.db.prepare('INSERT INTO chats (title) VALUES (?)').run(query.slice(0, 60));
      chatId = r.lastInsertRowid as number;
    }

    active.db.prepare('INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)').run(chatId, 'user', query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await answer(query, (history ?? []) as any, { root: active.root }, { model, thinking });

    active.db.prepare('INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)').run(chatId, 'assistant', result.text);
    active.db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chatId);

    res.json({ text: result.text, chatId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/chats', (_req: Request, res: Response) => {
  try {
    const chats = active.db.prepare(
      'SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC'
    ).all();
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/chats/:id/messages', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const chatRow = active.db.prepare('SELECT id FROM chats WHERE id = ?').get(id);
    if (!chatRow) return res.status(404).json({ error: 'Chat not found' });
    const messages = active.db.prepare(
      'SELECT role, content FROM chat_messages WHERE chat_id = ? ORDER BY id ASC'
    ).all(id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/chats/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    active.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Lint ─────────────────────────────────────────────────────────────────────

app.post('/api/lint', async (_req: Request, res: Response) => {
  try {
    await runLint({ root: active.root });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Graph ────────────────────────────────────────────────────────────────────

app.get('/api/graph', async (_req: Request, res: Response) => {
  try {
    res.json(await buildGraph({ root: active.root }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Sources ──────────────────────────────────────────────────────────────────

app.get('/api/sources', async (_req: Request, res: Response) => {
  try {
    const { readdir, stat } = await import('node:fs/promises');
    const rawDir = join(active.root, 'raw', 'sources');
    let files: string[] = [];
    try { files = await readdir(rawDir); } catch { /* empty */ }
    const sources = await Promise.all(
      files.filter(f => f.endsWith('.md') || f.endsWith('.pdf')).map(async f => {
        const full = join(rawDir, f);
        const s    = await stat(full);
        const slug = f.replace(/\.md$/, '').replace(/\.pdf$/, '');
        return { slug, path: `raw/sources/${f}`, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() };
      })
    );
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/source', async (req: Request, res: Response) => {
  const path = req.query.path as string | undefined;
  if (!path || path.includes('..')) { res.status(400).json({ error: 'invalid path' }); return; }
  try {
    const text = await readFileText(join(active.root, path));
    res.json({ path, text });
  } catch {
    res.status(404).json({ error: 'source not found' });
  }
});

app.delete('/api/source', async (req: Request, res: Response) => {
  const path = req.query.path as string | undefined;
  if (!path || path.includes('..') || !path.startsWith('raw/sources/')) {
    res.status(400).json({ error: 'invalid path' }); return;
  }
  try {
    const { unlink, readFile } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    // Clear SHA256 cache before deleting so re-ingest works
    try {
      const content = await readFile(pjoin(active.root, path), 'utf8');
      const hash = sha256(content);
      active.db.prepare('DELETE FROM ingest_queue WHERE sha256 = ?').run(hash);
      active.db.prepare('DELETE FROM analyze_cache WHERE sha256 = ?').run(hash);
    } catch { /* file may not exist yet, ignore */ }

    await unlink(pjoin(active.root, path));

    const slug = path.replace('raw/sources/', '').replace(/\.md$/, '');
    const pages = await listPages({ root: active.root });
    const toDelete = pages.filter(p => p.frontmatter.sources?.includes(path));

    const sourceSummaryPath = `sources/${slug}`;
    const hasSummaryPage = pages.some(p => p.path === sourceSummaryPath);
    if (hasSummaryPage && !toDelete.some(p => p.path === sourceSummaryPath)) {
      toDelete.push(pages.find(p => p.path === sourceSummaryPath)!);
    }

    for (const p of toDelete) {
      try {
        await unlink(pjoin(active.root, 'wiki', `${p.path}.md`));
        await removeFromIndex({ root: active.root }, p.path);
      } catch { /* ignore individual failures */ }
    }

    res.json({ deleted: path, cascadePages: toDelete.map(p => p.path) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Wiki pages ───────────────────────────────────────────────────────────────

app.get('/api/pages', async (_req: Request, res: Response) => {
  try {
    const pages = await listPages({ root: active.root });
    res.json(pages.map(p => ({ id: p.path, title: p.frontmatter.title, type: p.frontmatter.type })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/page', async (req: Request, res: Response) => {
  const path = req.query.path as string | undefined;
  if (!path || path.includes('..')) { res.status(400).json({ error: 'invalid path' }); return; }
  try {
    const page = await readPage({ root: active.root }, path);
    res.json(page);
  } catch {
    res.status(404).json({ error: 'page not found' });
  }
});

// ── Cost endpoints ───────────────────────────────────────────────────────────

app.get('/api/costs/sources', async (_req: Request, res: Response) => {
  try {
    let logText = '';
    try { logText = await readFileText(join(active.root, 'wiki', 'log.md')); } catch { /* no log */ }
    const entries = logText.split(/\n## \[/).slice(1);
    const sourceCosts: Record<string, number> = {};
    for (const e of entries) {
      if (!e.includes('] ingest |')) continue;
      const srcMatch = e.match(/source"?:\s*"([^"]+)"/);
      const costMatch = e.match(/cost_usd"?:\s*([0-9.]+)/);
      if (srcMatch && costMatch) {
        const src = srcMatch[1];
        const cost = parseFloat(costMatch[1]);
        sourceCosts[src] = Math.round(((sourceCosts[src] ?? 0) + cost) * 1_000_000) / 1_000_000;
      }
    }
    res.json(sourceCosts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/costs', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string | undefined) ?? 'month';
    let logText = '';
    try { logText = await readFileText(join(active.root, 'wiki', 'log.md')); } catch { /* no log */ }

    const breakdown = parseCostLog(logText);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    if (period === 'today') {
      const todayDays = breakdown.byDay.filter(d => d.date === today);
      const byType = { ingest: 0, chat: 0, lint: 0 };
      for (const d of todayDays) { byType.ingest += d.ingest; byType.chat += d.chat; byType.lint += d.lint; }
      return res.json({ total: byType.ingest + byType.chat + byType.lint, byType, byDay: todayDays });
    }

    if (period === 'month') {
      const monthDays = breakdown.byDay.filter(d => d.date.startsWith(thisMonth));
      const byType = { ingest: 0, chat: 0, lint: 0 };
      for (const d of monthDays) { byType.ingest += d.ingest; byType.chat += d.chat; byType.lint += d.lint; }
      return res.json({ total: byType.ingest + byType.chat + byType.lint, byType, byDay: monthDays });
    }

    return res.json(breakdown);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── SPA fallback ─────────────────────────────────────────────────────────────

if (existsSync(distDir)) {
  app.use((_req: Request, res: Response) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`RARE server on http://localhost:${PORT}`);
  console.log(`Vaults root: ${VAULTS_ROOT}`);
  console.log(`Active vault: ${active.slug} (${active.root})`);
});
