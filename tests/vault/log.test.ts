import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLog } from '../../src/vault/log';

describe('vault.log', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rare-')); });

  it('appends a greppable entry', async () => {
    const vault = { root: dir };
    await appendLog(vault, { event: 'ingest', title: 'Test Article', detail: { cost: 0.01 } });
    const content = await readFile(join(dir, 'wiki', 'log.md'), 'utf-8');
    expect(content).toMatch(/^## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] ingest \| Test Article$/m);
    expect(content).toContain('cost');
    await rm(dir, { recursive: true, force: true });
  });
});
