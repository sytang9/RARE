import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VaultRoot } from '../../src/vault/root';
import { writePage } from '../../src/vault/page';
import { buildGraph } from '../../src/vault/graph';

describe('buildGraph', () => {
  let vault: VaultRoot;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rare-graph-'));
    vault = { root: dir };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns empty graph when vault has no pages', async () => {
    const { nodes, links } = await buildGraph(vault);
    expect(nodes).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it('creates one node per wiki page with correct fields', async () => {
    await writePage(vault, {
      path: 'concepts/transformers',
      frontmatter: {
        type: 'concept',
        title: 'Transformers',
        sources: [],
        created: '2026-05-17T10:00:00Z',
        updated: '2026-05-17T10:00:00Z',
      },
      body: 'Attention is all you need.',
    });

    const { nodes } = await buildGraph(vault);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id:    'concepts/transformers',
      label: 'Transformers',
      type:  'concept',
    });
    expect(nodes[0].val).toBeGreaterThanOrEqual(1);
  });

  it('creates a link when page body contains a wikilink to another page', async () => {
    await writePage(vault, {
      path: 'concepts/transformers',
      frontmatter: {
        type: 'concept', title: 'Transformers',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: 'Relies on [[attention]] mechanism.',
    });
    await writePage(vault, {
      path: 'concepts/attention',
      frontmatter: {
        type: 'concept', title: 'Attention',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: 'Dot-product attention.',
    });

    const { links } = await buildGraph(vault);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      source: 'concepts/transformers',
      target: 'concepts/attention',
    });
  });

  it('deduplicates repeated wikilinks from the same page', async () => {
    await writePage(vault, {
      path: 'concepts/transformers',
      frontmatter: {
        type: 'concept', title: 'Transformers',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: '[[attention]] and more [[attention]] here.',
    });
    await writePage(vault, {
      path: 'concepts/attention',
      frontmatter: {
        type: 'concept', title: 'Attention',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: '',
    });

    const { links } = await buildGraph(vault);
    expect(links).toHaveLength(1);
  });

  it('ignores wikilinks that do not resolve to any page', async () => {
    await writePage(vault, {
      path: 'concepts/transformers',
      frontmatter: {
        type: 'concept', title: 'Transformers',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: 'See [[nonexistent-page]].',
    });

    const { links } = await buildGraph(vault);
    expect(links).toHaveLength(0);
  });

  it('sets val proportional to connection degree', async () => {
    await writePage(vault, {
      path: 'concepts/attention',
      frontmatter: {
        type: 'concept', title: 'Attention',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: '',
    });
    await writePage(vault, {
      path: 'concepts/transformers',
      frontmatter: {
        type: 'concept', title: 'Transformers',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: '[[attention]]',
    });
    await writePage(vault, {
      path: 'concepts/bert',
      frontmatter: {
        type: 'concept', title: 'BERT',
        sources: [], created: '2026-05-17T10:00:00Z', updated: '2026-05-17T10:00:00Z',
      },
      body: '[[attention]]',
    });

    const { nodes } = await buildGraph(vault);
    const hub = nodes.find(n => n.id === 'concepts/attention')!;
    const leaf = nodes.find(n => n.id === 'concepts/transformers')!;
    expect(hub.val).toBeGreaterThan(leaf.val);
  });
});
