import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from '../llm/anthropic';
import type { AnalyzeResult } from './analyze';

export interface GenerateInput {
  analysis: AnalyzeResult;
  purpose: string;
  schema: string;
  sourceExcerpt: string;
}

export interface GeneratedPage {
  path: string;
  body: string;
}

const WRITE_TOOL = {
  name: 'write_pages',
  description: 'Write the markdown body for each recommended page.',
  input_schema: {
    type: 'object',
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['path', 'body'],
        },
      },
    },
    required: ['pages'],
  },
} as const;

export async function generate(input: GenerateInput): Promise<GeneratedPage[]> {
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '../../prompts/generate.md');
  const template = await readFile(promptPath, 'utf-8');
  const prompt = template
    .replace('{{purpose}}', input.purpose)
    .replace('{{schema}}',  input.schema)
    .replace('{{analysis}}', JSON.stringify(input.analysis, null, 2))
    .replace('{{source}}',  input.sourceExcerpt.slice(0, 8000));

  const result = await chat({
    model: 'haiku',
    system: 'You generate wiki pages.',
    messages: [{ role: 'user', content: prompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [WRITE_TOOL as any],
    maxTokens: 8192,
  });
  if (!result.toolUse || result.toolUse.name !== 'write_pages') {
    throw new Error('Expected tool_use(write_pages)');
  }
  return (result.toolUse.input as { pages: GeneratedPage[] }).pages;
}
