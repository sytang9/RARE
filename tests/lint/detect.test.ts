import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectOrphans, detectDeadLinks } from '../../src/lint/detect';

describe('lint.detect', () => {
  let dir: string;
  async function page(rel: string, body: string) {
    await mkdir(join(dir, 'wiki', rel.split('/')[0]), { recursive: true });
    await writeFile(join(dir, 'wiki', `${rel}.md`),
      `---\ntype: concept\ntitle: t\nsources: []\ncreated: ""\nupdated: ""\n---\n\n${body}`, 'utf-8');
  }
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rare-')); });

  it('finds orphan pages', async () => {
    await page('concepts/a', '# A links to [[concepts/b]]');
    await page('concepts/b', '# B body');
    await page('concepts/c', '# C body');     // orphan
    const orphans = await detectOrphans({ root: dir });
    expect(orphans).toContain('concepts/c');
    expect(orphans).not.toContain('concepts/b');
    await rm(dir, { recursive: true, force: true });
  });

  it('finds dead wikilinks', async () => {
    await page('concepts/a', '# A links to [[concepts/nonexistent]]');
    const dead = await detectDeadLinks({ root: dir });
    expect(dead).toEqual([{ from: 'concepts/a', to: 'concepts/nonexistent' }]);
    await rm(dir, { recursive: true, force: true });
  });
});
