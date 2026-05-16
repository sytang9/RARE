import chatTemplate from '../../prompts/chat.md?raw';
import { chat } from '../llm/anthropic';
import { findRelevantPages } from '../retrieve/findRelevantPages';
import { extractWikilinks } from '../vault/wikilinks';
import { appendLog } from '../vault/log';
import { readFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
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
  const purpose = await safeRead(pathJoin(vault.root, 'purpose.md'));
  const pagesBlock = pages
    .map((p, i) => `[${i + 1}] ${p.path}\n${p.body}`)
    .join('\n\n---\n\n');
  const convBlock = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const prompt = chatTemplate
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
    return await readFileText(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    // Tauri invoke errors are strings, not Error objects with .code
    if (typeof err === 'string' && err.includes('No such file')) return '';
    throw err;
  }
}
