import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureObsidianConfig } from '../../src/lib/obsidian-config';

describe('lib.obsidian-config', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rare-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes .obsidian/app.json with recommended settings', async () => {
    await ensureObsidianConfig({ root: dir });
    const config = JSON.parse(
      await readFile(join(dir, '.obsidian', 'app.json'), 'utf-8')
    );
    expect(config.alwaysUpdateLinks).toBe(true);
    expect(config.useMarkdownLinks).toBe(false);
    expect(config.newLinkFormat).toBe('shortest');
    expect(config.attachmentFolderPath).toBe('raw/assets');
  });

  it('does not overwrite existing .obsidian/app.json', async () => {
    await mkdir(join(dir, '.obsidian'), { recursive: true });
    await writeFile(
      join(dir, '.obsidian', 'app.json'),
      '{"custom":true}',
      'utf-8'
    );
    await ensureObsidianConfig({ root: dir });
    const config = JSON.parse(
      await readFile(join(dir, '.obsidian', 'app.json'), 'utf-8')
    );
    expect(config.custom).toBe(true);
    expect(config.alwaysUpdateLinks).toBeUndefined();
  });
});
