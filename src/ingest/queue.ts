export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface QueueTask {
  id: number;
  source_path: string;
  sha256: string;
  status: TaskStatus;
  retry_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueBackend {
  execute: (sql: string, params?: unknown[]) => unknown;
  select: <T>(sql: string, params?: unknown[]) => T;
}

export function createQueue(db: QueueBackend) {
  return {
    async enqueue(sourcePath: string, sha256: string): Promise<QueueTask> {
      const now = new Date().toISOString();
      db.execute(
        `INSERT INTO ingest_queue (source_path, sha256, status, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?)`,
        [sourcePath, sha256, now, now],
      );
      const rows = db.select<QueueTask[]>(
        'SELECT * FROM ingest_queue WHERE sha256 = ?',
        [sha256],
      );
      return rows[0];
    },
    async next(): Promise<QueueTask | null> {
      const rows = db.select<QueueTask[]>(
        `SELECT * FROM ingest_queue WHERE status = 'pending' ORDER BY id LIMIT 1`,
      );
      if (rows.length === 0) return null;
      const task = rows[0];
      const now = new Date().toISOString();
      db.execute(
        `UPDATE ingest_queue SET status='processing', updated_at=? WHERE id=?`,
        [now, task.id],
      );
      return { ...task, status: 'processing', updated_at: now };
    },
    async markDone(id: number): Promise<void> {
      db.execute(
        `UPDATE ingest_queue SET status='done', updated_at=? WHERE id=?`,
        [new Date().toISOString(), id],
      );
    },
    async markFailed(id: number, error: string): Promise<void> {
      db.execute(
        `UPDATE ingest_queue
           SET status='failed', error=?, retry_count=retry_count+1, updated_at=?
         WHERE id=?`,
        [error, new Date().toISOString(), id],
      );
    },
    async recoverInFlight(): Promise<void> {
      db.execute(
        `UPDATE ingest_queue
           SET status='pending', updated_at=?
         WHERE status='processing'`,
        [new Date().toISOString()],
      );
    },
    async list(filter?: { status?: TaskStatus }): Promise<QueueTask[]> {
      if (filter?.status) {
        return db.select<QueueTask[]>(
          'SELECT * FROM ingest_queue WHERE status=? ORDER BY id',
          [filter.status],
        );
      }
      return db.select<QueueTask[]>('SELECT * FROM ingest_queue ORDER BY id');
    },
  };
}
