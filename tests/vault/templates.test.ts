import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault } from '../../src/vault/templates';

describe('vault.templates', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rare-')); });

  it('creates purpose.md and schema.md if missing', async () => {
    await initVault({ root: dir });
    const purpose = await readFile(join(dir, 'purpose.md'), 'utf-8');
    const schema  = await readFile(join(dir, 'schema.md'),  'utf-8');
    expect(purpose).toContain('Vault Purpose');
    expect(schema).toContain('Page types');
    await rm(dir, { recursive: true, force: true });
  });

  it('does not overwrite existing files', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'purpose.md'), 'custom', 'utf-8');
    await initVault({ root: dir });
    const purpose = await readFile(join(dir, 'purpose.md'), 'utf-8');
    expect(purpose).toBe('custom');
    await rm(dir, { recursive: true, force: true });
  });
});
