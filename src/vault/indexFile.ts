import { readFileText, writeFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
import { wikiDir, type VaultRoot } from './root';
import type { PageFrontmatter } from './page';

type PageType = PageFrontmatter['type'];

export interface IndexEntry {
  path: string;
  title: string;
  type: PageType;
  summary: string;
}

const SECTION_TITLES: Record<PageType, string> = {
  source: 'Sources',
  entity: 'Entities',
  concept: 'Concepts',
};

const indexPath = (v: VaultRoot): string => pathJoin(wikiDir(v), 'index.md');

export async function readIndex(vault: VaultRoot): Promise<string> {
  try {
    return await readFileText(indexPath(vault));
  } catch {
    return '# Index\n\n## Concepts\n\n## Entities\n\n## Sources\n';
  }
}

export async function updateIndex(vault: VaultRoot, entry: IndexEntry): Promise<void> {
  let body = await readIndex(vault);

  for (const t of ['concept', 'entity', 'source'] as const) {
    const header = `## ${SECTION_TITLES[t]}`;
    if (!body.includes(header)) {
      body += `\n${header}\n`;
    }
  }

  body = body
    .split('\n')
    .filter((line) => !line.includes(`[[${entry.path}]]`))
    .join('\n');

  const newLine = `- [[${entry.path}]] — ${entry.summary}`;
  const header = `## ${SECTION_TITLES[entry.type]}`;
  const headerIdx = body.indexOf(header);

  if (headerIdx === -1) {
    throw new Error(`missing section ${header}`);
  }

  const nextNewline = body.indexOf('\n', headerIdx);
  if (nextNewline === -1) {
    throw new Error(`malformed index: no newline after ${header}`);
  }

  body = body.slice(0, nextNewline + 1) + newLine + '\n' + body.slice(nextNewline + 1);

  await writeFileText(indexPath(vault), body);
}

export async function removeFromIndex(vault: VaultRoot, pagePath: string): Promise<void> {
  const body = await readIndex(vault);
  const filtered = body
    .split('\n')
    .filter((line) => !line.includes(`[[${pagePath}]]`))
    .join('\n');
  await writeFileText(indexPath(vault), filtered);
}
