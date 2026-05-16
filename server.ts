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
import { sumLogCosts } from './src/lib/cost.js';

// --- env validation ---
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required');
const VAULT_PATH = process.env.VAULT_PATH;
if (!VAULT_PATH) throw new Error('VAULT_PATH env var is required');
const PORT = Number(process.env.PORT ?? 3000);

initAnthropic(API_KEY);

// --- DB setup ---
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

app.get('/api/queue', async (_req: Request, res: Response) => {
  try {
    res.json(await queue.list());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { query, history } = req.body as { query?: string; history?: unknown[] };
    if (!query) return res.status(400).json({ error: 'query required' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await answer(query, (history ?? []) as any, vault);
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
