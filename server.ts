import express from 'express';
import type { Request, Response } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
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
import { pdfToMarkdown } from './src/sources/pdf.js';
import { writeFileText, readFileText } from './src/lib/fs.js';
import { sumLogCosts, parseCostLog } from './src/lib/cost.js';
import { buildGraph } from './src/vault/graph.js';
import { listPages, readPage } from './src/vault/page.js';
import { removeFromIndex } from './src/vault/indexFile.js';

// --- env validation ---
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required');

const _vaultRaw = process.env.VAULT_PATH ?? join(fileURLToPath(new URL('.', import.meta.url)), 'vault');
const VAULT_PATH = resolvePath(_vaultRaw);
const PORT = Number(process.env.PORT ?? 3100);

initAnthropic(API_KEY);

// --- DB setup ---
mkdirSync(VAULT_PATH, { recursive: true });
const RARE_DIR = join(VAULT_PATH, '.rare');
mkdirSync(RARE_DIR, { recursive: true });

const rawDb = new BetterSqlite3(join(RARE_DIR, 'queue.sqlite'));
rawDb.exec(`
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
`);

// Adapt better-sqlite3 (synchronous) to the QueueBackend interface
const queueBackend: QueueBackend = {
  execute: (sql: string, params: unknown[] = []) => rawDb.prepare(sql).run(...(params as Parameters<typeof rawDb.prepare>[0][])),
  select: <T>(sql: string, params: unknown[] = []) => rawDb.prepare(sql).all(...(params as Parameters<typeof rawDb.prepare>[0][])) as T,
};

const queue = createQueue(queueBackend);
const vault = { root: VAULT_PATH };

// --- settings helpers ---
interface SettingsRow { key: string; value: string; }
interface SettingsShape { cost_ceiling_usd: number; lint_interval_hours: number; }

const SETTINGS_DEFAULTS: SettingsShape = { cost_ceiling_usd: 10, lint_interval_hours: 24 };

function dbGetSettings(): SettingsShape {
  const rows = rawDb.prepare('SELECT key, value FROM settings').all() as SettingsRow[];
  const out = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (r.key === 'cost_ceiling_usd' || r.key === 'lint_interval_hours') {
      (out as Record<string, unknown>)[r.key] = Number(r.value);
    }
  }
  return out;
}

function dbUpdateSettings(patch: Partial<SettingsShape>): void {
  const stmt = rawDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(patch)) stmt.run(k, String(v));
}

// --- worker ---
let workerRunning = false;

function triggerWorker() {
  if (workerRunning) return;
  workerRunning = true;
  runWorkerOnce(queue, (srcPath) => ingestSource(vault, srcPath))
    .catch((err) => console.error('Worker error:', err))
    .finally(() => { workerRunning = false; });
}

// --- startup ---
await initVault(vault);
await queue.recoverInFlight();
triggerWorker(); // drain any pending items from before a crash

// Lint-on-open — non-fatal: skip if vault is empty or API key is invalid
const { lint_interval_hours } = dbGetSettings();
maybeRunLint(vault, lint_interval_hours).catch((err) =>
  console.warn('Lint on startup skipped:', String(err)),
);

// --- express app ---
const app = express();
app.use(express.json());

// Serve Vite build in production
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
}

// --- routes ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/settings', async (_req: Request, res: Response) => {
  try {
    const s = dbGetSettings();
    let monthly = 0;
    try {
      const log = await readFileText(join(VAULT_PATH, 'wiki', 'log.md'));
      monthly = sumLogCosts(log, new Date().toISOString().slice(0, 7));
    } catch { /* no log yet */ }
    res.json({ ...s, vault_path: VAULT_PATH, monthly_cost_usd: monthly });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/settings', (req: Request, res: Response) => {
  try {
    const patch: Partial<SettingsShape> = {};
    const { cost_ceiling_usd, lint_interval_hours: lih } = req.body as Record<string, unknown>;
    if (cost_ceiling_usd !== undefined) patch.cost_ceiling_usd = Number(cost_ceiling_usd);
    if (lih !== undefined) patch.lint_interval_hours = Number(lih);
    dbUpdateSettings(patch);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/ingest/url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url) return res.status(400).json({ error: 'url required' });

    const resp = await fetch(url);
    if (!resp.ok) return res.status(400).json({ error: `Fetch failed: ${resp.statusText}` });
    const html = await resp.text();
    const { title, markdown } = await htmlToMarkdown(html, url);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
    const rawPath = `raw/sources/${slug}.md`;
    await writeFileText(join(VAULT_PATH, rawPath), markdown);

    const hash = sha256(markdown);
    try {
      const task = await queue.enqueue(rawPath, hash);
      triggerWorker();
      res.json({ jobId: task.id });
    } catch {
      // Duplicate SHA — already in queue or done
      const existing = queueBackend.select<{ id: number; status: string }[]>(
        'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash]
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
    await writeFileText(join(VAULT_PATH, rawPath), content);

    const hash = sha256(content);
    try {
      const task = await queue.enqueue(rawPath, hash);
      triggerWorker();
      res.json({ jobId: task.id });
    } catch {
      const existing = queueBackend.select<{ id: number; status: string }[]>(
        'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash]
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
    const filename = ((req.headers['x-filename'] as string) ?? 'upload.pdf')
      .replace(/[/\\]/g, '');
    const slug = filename.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';

    if (visionPdf) {
      // Vision mode: store raw PDF bytes, SHA of bytes
      const rawPath = `raw/sources/${slug}.pdf`;
      const destPath = join(VAULT_PATH, rawPath);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(destPath, buffer);
      const hash = sha256(buffer.toString('base64'));
      try {
        const task = await queue.enqueue(rawPath, hash);
        triggerWorker();
        res.json({ jobId: task.id });
      } catch {
        const existing = queueBackend.select<{ id: number; status: string }[]>(
          'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
        );
        res.json({ jobId: existing[0]?.id ?? 0, cached: true });
      }
    } else {
      // Text mode: extract text, store as .md, SHA of text
      const pdfParse = ((await import('pdf-parse')) as { default: (buf: Buffer) => Promise<{ text: string }> }).default;
      const { text } = await pdfParse(buffer);
      if (!text.trim()) return res.status(422).json({ error: 'No text extracted from PDF' });
      const rawPath = `raw/sources/${slug}.md`;
      await writeFileText(join(VAULT_PATH, rawPath), text);
      const hash = sha256(text);
      try {
        const task = await queue.enqueue(rawPath, hash);
        triggerWorker();
        res.json({ jobId: task.id });
      } catch {
        const existing = queueBackend.select<{ id: number; status: string }[]>(
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
    res.json(await queue.list());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { query, history, model: rawModel, thinking: rawThinking } = req.body as {
      query?: string;
      history?: unknown[];
      model?: string;
      thinking?: boolean;
    };
    if (!query) return res.status(400).json({ error: 'query required' });
    const VALID_MODELS = ['haiku', 'sonnet', 'opus'] as const;
    const model = VALID_MODELS.includes(rawModel as typeof VALID_MODELS[number])
      ? (rawModel as typeof VALID_MODELS[number])
      : 'sonnet';
    const thinking = rawThinking === true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await answer(query, (history ?? []) as any, vault, { model, thinking });
    res.json({ text: result.text });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/lint', async (_req: Request, res: Response) => {
  try {
    await runLint(vault);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/graph', async (_req: Request, res: Response) => {
  try {
    res.json(await buildGraph(vault));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Sources ──────────────────────────────────────────────────────────────────

app.get('/api/sources', async (_req: Request, res: Response) => {
  try {
    const { readdir, stat } = await import('node:fs/promises');
    const rawDir = join(VAULT_PATH, 'raw', 'sources');
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
    const text = await readFileText(join(VAULT_PATH, path));
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
    const { unlink } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    // Delete raw source file
    await unlink(pjoin(VAULT_PATH, path));

    // Slug derived from raw path: "raw/sources/foo-bar.md" → "foo-bar"
    const slug = path.replace('raw/sources/', '').replace(/\.md$/, '');

    // Cascade: delete wiki pages that reference this source in their sources[] frontmatter
    const pages = await listPages(vault);
    const toDelete = pages.filter(p => p.frontmatter.sources?.includes(path));

    // Also delete the source summary page (wiki/sources/<slug>.md) directly,
    // because older pages written before the sources[] fix have sources: []
    // and would otherwise survive the provenance-based filter above.
    const sourceSummaryPath = `sources/${slug}`;
    const hasSummaryPage = pages.some(p => p.path === sourceSummaryPath);
    if (hasSummaryPage && !toDelete.some(p => p.path === sourceSummaryPath)) {
      toDelete.push(pages.find(p => p.path === sourceSummaryPath)!);
    }

    for (const p of toDelete) {
      try {
        await unlink(pjoin(VAULT_PATH, 'wiki', `${p.path}.md`));
        await removeFromIndex(vault, p.path);
      } catch { /* ignore individual failures */ }
    }

    res.json({ deleted: path, cascadePages: toDelete.map(p => p.path) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Wiki pages ───────────────────────────────────────────────────────────────

// List all wiki pages (lightweight: id, title, type only)
app.get('/api/pages', async (_req: Request, res: Response) => {
  try {
    const pages = await listPages(vault);
    res.json(pages.map(p => ({ id: p.path, title: p.frontmatter.title, type: p.frontmatter.type })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get a single wiki page by path (passed as query param to avoid slash encoding issues)
app.get('/api/page', async (req: Request, res: Response) => {
  const path = req.query.path as string | undefined;
  if (!path || path.includes('..')) { res.status(400).json({ error: 'invalid path' }); return; }
  try {
    const page = await readPage(vault, path);
    res.json(page);
  } catch {
    res.status(404).json({ error: 'page not found' });
  }
});

// ── Cost endpoints ───────────────────────────────────────────────────────────

app.get('/api/costs/sources', async (_req: Request, res: Response) => {
  try {
    let logText = '';
    try { logText = await readFileText(join(VAULT_PATH, 'wiki', 'log.md')); } catch { /* no log */ }
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
    try { logText = await readFileText(join(VAULT_PATH, 'wiki', 'log.md')); } catch { /* no log */ }

    const breakdown = parseCostLog(logText);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    if (period === 'today') {
      const todayDays = breakdown.byDay.filter(d => d.date === today);
      const byType = { ingest: 0, chat: 0, lint: 0 };
      for (const d of todayDays) {
        byType.ingest += d.ingest;
        byType.chat   += d.chat;
        byType.lint   += d.lint;
      }
      const total = byType.ingest + byType.chat + byType.lint;
      return res.json({ total, byType, byDay: todayDays });
    }

    if (period === 'month') {
      const monthDays = breakdown.byDay.filter(d => d.date.startsWith(thisMonth));
      const byType = { ingest: 0, chat: 0, lint: 0 };
      for (const d of monthDays) {
        byType.ingest += d.ingest;
        byType.chat   += d.chat;
        byType.lint   += d.lint;
      }
      const total = byType.ingest + byType.chat + byType.lint;
      return res.json({ total, byType, byDay: monthDays });
    }

    // 'all'
    return res.json(breakdown);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// SPA fallback — must be last
if (existsSync(distDir)) {
  app.use((_req: Request, res: Response) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`RARE server on http://localhost:${PORT}`);
  console.log(`Vault: ${VAULT_PATH}`);
});
