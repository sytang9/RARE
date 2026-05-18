import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateIndex, readIndex } from '../../src/vault/indexFile';
import { writePage } from '../../src/vault/page';

describe('vault.indexFile', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rare-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('inserts a page into the index under its type', async () => {
    const vault = { root: dir };
    await writePage(vault, {
      path: 'concepts/foo',
      frontmatter: { type: 'concept', title: 'Foo', sources: [], created: '', updated: '' },
      body: '',
    });
    await updateIndex(vault, {
      path: 'concepts/foo',
      title: 'Foo',
      type: 'concept',
      summary: 'a foo concept',
    });
    const indexText = await readIndex(vault);
    expect(indexText).toMatch(/^## Concepts$/m);
    expect(indexText).toContain('[[concepts/foo]] — a foo concept');
  });

  it('replaces a previous entry for the same path', async () => {
    const vault = { root: dir };
    await updateIndex(vault, { path: 'concepts/foo', title: 'Foo', type: 'concept', summary: 'old' });
    await updateIndex(vault, { path: 'concepts/foo', title: 'Foo', type: 'concept', summary: 'new' });
    const indexText = await readIndex(vault);
    expect((indexText.match(/concepts\/foo/g) ?? []).length).toBe(1);
    expect(indexText).toContain('new');
  });
});
