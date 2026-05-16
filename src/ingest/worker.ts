import type { QueueTask } from './queue';

export interface WorkerQueue {
  next(): Promise<QueueTask | null>;
  markDone(id: number): Promise<void>;
  markFailed(id: number, error: string): Promise<void>;
}

export async function runWorkerOnce(
  queue: WorkerQueue,
  ingestFn: (sourcePath: string) => Promise<void>,
): Promise<void> {
  while (true) {
    const task = await queue.next();
    if (!task) return;
    try {
      await ingestFn(task.source_path);
      await queue.markDone(task.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await queue.markFailed(task.id, msg);
    }
  }
}
