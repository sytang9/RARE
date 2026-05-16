import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const __dir = dirname(fileURLToPath(import.meta.url));
  const indexBody = await readIndex(vault);
  const template = await readFile(join(__dir, '../../prompts/retrieve.md'), 'utf-8');
  const prompt = template.replace('{{index}}', indexBody).replace('{{query}}', query);

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

  const { paths } = result.toolUse.input as { paths: string[] };
  const pages: RelevantPage[] = [];
  for (const path of paths.slice(0, 8)) {
    try {
      const p = await readPage(vault, path);
      pages.push({ path, title: p.frontmatter.title, body: p.body });
    } catch {
      // skip missing — LLM hallucinated a path
    }
  }
  return pages;
}
