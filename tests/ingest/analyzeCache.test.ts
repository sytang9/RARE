import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createAnalyzeCache } from '../../src/ingest/analyzeCache';

describe('ingest.analyzeCache', () => {
  let db: Database.Database;
  let cache: ReturnType<typeof createAnalyzeCache>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE analyze_cache (
      sha256 TEXT PRIMARY KEY,
      analyze_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`);
    cache = createAnalyzeCache({
      execute: (sql, p) => db.prepare(sql).run(...(p ?? [])),
      select:  <T>(sql: string, p?: unknown[]) => db.prepare(sql).all(...(p ?? [])) as T,
    });
  });

  it('round-trips a cached analysis', async () => {
    const analysis = { source_title: 'x', entities: [], concepts: [], connections: [], contradictions: [], recommended_pages: [], source_summary: '' };
    await cache.put('s1', analysis as never);
    const hit = await cache.get('s1');
    expect(hit?.source_title).toBe('x');
  });

  it('returns null on cache miss', async () => {
    expect(await cache.get('missing')).toBeNull();
  });
});
