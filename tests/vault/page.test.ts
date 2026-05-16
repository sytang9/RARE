import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VaultRoot } from '../../src/vault/root';
import { readPage, writePage, listPages } from '../../src/vault/page';

describe('vault.page', () => {
  let vault: VaultRoot;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rare-'));
    vault = { root: dir };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes and reads a page', async () => {
    await writePage(vault, {
      path: 'concepts/cosine-similarity',
      frontmatter: {
        type: 'concept',
        title: 'Cosine Similarity',
        sources: ['raw/sources/a.md'],
        created: '2026-05-16T14:32:00Z',
        updated: '2026-05-16T14:32:00Z',
      },
      body: '# Cosine Similarity\n\nAngle-based similarity.',
    });
    const page = await readPage(vault, 'concepts/cosine-similarity');
    expect(page.frontmatter.title).toBe('Cosine Similarity');
    expect(page.body).toContain('Angle-based');
  });

  it('lists pages by type', async () => {
    await writePage(vault, {
      path: 'concepts/a',
      frontmatter: { type: 'concept', title: 'A', sources: [], created: '', updated: '' },
      body: '',
    });
    await writePage(vault, {
      path: 'entities/b',
      frontmatter: { type: 'entity', title: 'B', sources: [], created: '', updated: '' },
      body: '',
    });
    const concepts = await listPages(vault, 'concept');
    expect(concepts.map(p => p.frontmatter.title)).toEqual(['A']);
  });

  it('lists all pages when type not specified', async () => {
    await writePage(vault, {
      path: 'concepts/concept-a',
      frontmatter: { type: 'concept', title: 'Concept A', sources: [], created: '', updated: '' },
      body: '',
    });
    await writePage(vault, {
      path: 'entities/entity-b',
      frontmatter: { type: 'entity', title: 'Entity B', sources: [], created: '', updated: '' },
      body: '',
    });
    const allPages = await listPages(vault);
    expect(allPages.length).toBe(2);
    expect(allPages.map(p => p.frontmatter.title).sort()).toEqual(['Concept A', 'Entity B']);
  });
});
