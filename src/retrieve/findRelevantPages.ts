import retrieveTemplate from '../../prompts/retrieve.md?raw';
import { chat } from '../llm/anthropic';
import { readPage } from '../vault/page';
import { readIndex } from '../vault/indexFile';
import type { VaultRoot } from '../vault/root';

export interface RelevantPage {
  path: string;
  title: string;
  body: string;
}

const PICK_TOOL = {
  name: 'pick_pages',
  description: 'Pick up to 8 wiki page paths from the index.',
  input_schema: {
    type: 'object' as const,
    properties: {
      paths: { type: 'array', items: { type: 'string' } },
    },
    required: ['paths'],
  },
};

export async function findRelevantPages(
  query: string,
  vault: VaultRoot,
): Promise<RelevantPage[]> {
  const indexBody = await readIndex(vault);
  const prompt = retrieveTemplate.replace('{{index}}', indexBody).replace('{{query}}', query);

  const result = await chat({
    model: 'sonnet',
    system: 'You pick wiki pages to read.',
    messages: [{ role: 'user', content: prompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [PICK_TOOL as any],
    maxTokens: 512,
  });

  if (!result.toolUse || result.toolUse.name !== 'pick_pages') {
    return [];
  }

  const raw = result.toolUse.input as Record<string, unknown>;
  const paths = Array.isArray(raw?.paths)
    ? (raw.paths as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  const pages: RelevantPage[] = [];
  for (const path of paths.slice(0, 8)) {
    try {
      const p = await readPage(vault, path);
      pages.push({ path, title: p.frontmatter.title, body: p.body });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[findRelevantPages] unexpected error reading ${path}:`, err);
      }
    }
  }
  return pages;
}
