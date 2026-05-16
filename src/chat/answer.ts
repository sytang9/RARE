import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from '../llm/anthropic';
import { findRelevantPages } from '../retrieve/findRelevantPages';
import { extractWikilinks } from '../vault/wikilinks';
import { appendLog } from '../vault/log';
import type { VaultRoot } from '../vault/root';

export interface Message { role: 'user' | 'assistant'; content: string; }

export interface AnswerResult {
  text: string;
  citations: string[];
  cost: { inputTokens: number; outputTokens: number; usd: number };
}

export async function answer(
  query: string,
  history: Message[],
  vault: VaultRoot,
): Promise<AnswerResult> {
  const pages = await findRelevantPages(query, vault);
  const purpose = await safeRead(`${vault.root}/purpose.md`);
  const __dir = dirname(fileURLToPath(import.meta.url));
  const template = await readFile(join(__dir, '../../prompts/chat.md'), 'utf-8');
  const pagesBlock = pages
    .map((p, i) => `[${i + 1}] ${p.path}\n${p.body}`)
    .join('\n\n---\n\n');
  const convBlock = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const prompt = template
    .replace('{{purpose}}', purpose)
    .replace('{{pages}}', pagesBlock)
    .replace('{{conversation}}', convBlock)
    .replace('{{query}}', query);

  const result = await chat({
    model: 'sonnet',
    system: 'You are a careful, sourced research assistant.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
  });

  await appendLog(vault, {
    event: 'query',
    title: query.slice(0, 80),
    detail: {
      pages_read: pages.map(p => p.path),
      cost_usd: result.usd,
      tokens: { input: result.inputTokens, output: result.outputTokens },
    },
  });

  return {
    text: result.text,
    citations: extractWikilinks(result.text),
    cost: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, usd: result.usd },
  };
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}
