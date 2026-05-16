import { readFileText, writeFileText, listDir } from '../lib/fs';
import { pathJoin } from '../lib/path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter';
import { wikiDir, type VaultRoot } from './root';

export interface PageFrontmatter {
  type: 'source' | 'entity' | 'concept';
  title: string;
  sources: string[];
  created: string;
  updated: string;
}

export interface Page {
  path: string;
  frontmatter: PageFrontmatter;
  body: string;
}

export async function readPage(vault: VaultRoot, relPath: string): Promise<Page> {
  const file = pathJoin(wikiDir(vault), `${relPath}.md`);
  const raw = await readFileText(file);
  const { data, body } = parseFrontmatter(raw);
  return { path: relPath, frontmatter: data as unknown as PageFrontmatter, body };
}

export async function writePage(vault: VaultRoot, page: Page): Promise<void> {
  const file = pathJoin(wikiDir(vault), `${page.path}.md`);
  const out = stringifyFrontmatter({
    data: page.frontmatter as unknown as Record<string, unknown>,
    body: page.body,
  });
  await writeFileText(file, out);
}

function typeToDirName(type: PageFrontmatter['type']): string {
  if (type === 'entity') return 'entities';
  return `${type}s`;
}

export async function listPages(
  vault: VaultRoot,
  type?: PageFrontmatter['type'],
): Promise<Page[]> {
  const types: PageFrontmatter['type'][] = type ? [type] : ['source', 'entity', 'concept'];
  const out: Page[] = [];
  for (const t of types) {
    const dirName = typeToDirName(t);
    const dir = pathJoin(wikiDir(vault), dirName);
    let entries: string[] = [];
    try {
      entries = await listDir(dir);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.endsWith('.md')) continue;
      const relPath = `${dirName}/${e.replace(/\.md$/, '')}`;
      out.push(await readPage(vault, relPath));
    }
  }
  return out;
}

