import { describe, it, expect, vi } from 'vitest';
import { runWorkerOnce } from '../../src/ingest/worker';

describe('ingest.worker', () => {
  it('claims a pending task, runs ingest, marks done', async () => {
    const queue = {
      next: vi.fn().mockResolvedValueOnce({ id: 1, source_path: 'raw/sources/a.md', sha256: 's' })
                   .mockResolvedValue(null),
      markDone: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const ingestFn = vi.fn().mockResolvedValue(undefined);
    await runWorkerOnce(queue as unknown as Parameters<typeof runWorkerOnce>[0], ingestFn);
    expect(ingestFn).toHaveBeenCalledWith('raw/sources/a.md');
    expect(queue.markDone).toHaveBeenCalledWith(1);
  });

  it('marks failed on error', async () => {
    const queue = {
      next: vi.fn().mockResolvedValueOnce({ id: 2, source_path: 'x', sha256: 's' })
                   .mockResolvedValue(null),
      markDone: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const ingestFn = vi.fn().mockRejectedValue(new Error('boom'));
    await runWorkerOnce(queue as unknown as Parameters<typeof runWorkerOnce>[0], ingestFn);
    expect(queue.markFailed).toHaveBeenCalledWith(2, 'boom');
  });
});
