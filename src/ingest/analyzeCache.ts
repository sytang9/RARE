import type { AnalyzeResult } from './analyze';
import type { QueueBackend } from './queue';

export function createAnalyzeCache(db: QueueBackend) {
  return {
    async get(sha256: string): Promise<AnalyzeResult | null> {
      const rows = db.select<{ analyze_json: string }[]>(
        'SELECT analyze_json FROM analyze_cache WHERE sha256 = ?',
        [sha256],
      );
      return rows.length ? JSON.parse(rows[0].analyze_json) as AnalyzeResult : null;
    },
    async put(sha256: string, analysis: AnalyzeResult): Promise<void> {
      db.execute(
        `INSERT OR REPLACE INTO analyze_cache (sha256, analyze_json, created_at)
         VALUES (?, ?, ?)`,
        [sha256, JSON.stringify(analysis), new Date().toISOString()],
      );
    },
  };
}
