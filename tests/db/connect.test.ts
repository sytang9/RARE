import { describe, it, expect } from 'vitest';
import { openDb, closeDb } from '../../src/db/connect';

describe('db.connect', () => {
  // Skipped: this exercises the Tauri plugin path which can't run under Vitest.
  // The schema is tested end-to-end via Task 2.1's queue tests (better-sqlite3).
  it.skip('opens an in-memory sqlite and runs migrations', async () => {
    const db = await openDb(':memory:');
    const tables = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map(t => t.name);
    expect(names).toContain('settings');
    expect(names).toContain('ingest_queue');
    expect(names).toContain('analyze_cache');
    await closeDb(db);
  });
});
