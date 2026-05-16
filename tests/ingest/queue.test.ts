import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createQueue } from '../../src/ingest/queue';

describe('ingest.queue', () => {
  let db: Database.Database;
  let queue: ReturnType<typeof createQueue>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE ingest_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL,
        sha256 TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    queue = createQueue({
      execute: (sql, params) => db.prepare(sql).run(...(params ?? [])),
      select: <T>(sql: string, params?: unknown[]) => db.prepare(sql).all(...(params ?? [])) as T,
    });
  });

  it('enqueues and dequeues a task', async () => {
    const task = await queue.enqueue('raw/sources/a.md', 'sha-a');
    expect(task.status).toBe('pending');
    const next = await queue.next();
    expect(next?.sha256).toBe('sha-a');
    expect(next?.status).toBe('processing');
  });

  it('rejects duplicate sha256', async () => {
    await queue.enqueue('raw/sources/a.md', 'sha-a');
    await expect(queue.enqueue('raw/sources/a.md', 'sha-a')).rejects.toThrow(/UNIQUE/);
  });

  it('marks done and failed correctly', async () => {
    await queue.enqueue('a', 's1');
    const t = await queue.next();
    await queue.markDone(t!.id);
    const after = await queue.list({ status: 'done' });
    expect(after).toHaveLength(1);
  });

  it('recovers in-flight tasks on restart', async () => {
    await queue.enqueue('a', 's1');
    await queue.next();   // moves to processing
    await queue.recoverInFlight();
    const pending = await queue.list({ status: 'pending' });
    expect(pending).toHaveLength(1);
  });
});
