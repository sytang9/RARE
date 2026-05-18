import generateTemplate from '../../prompts/generate.md?raw';
import { chat } from '../llm/anthropic';
import type { AnalyzeResult } from './analyze';

export interface GenerateInput {
  analysis: AnalyzeResult;
  purpose: string;
  schema: string;
  sourceExcerpt: string;
  existingPages?: Record<string, string>; // path → current body, for update actions
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

const BATCH_SIZE = 4;

async function generateBatch(
  batchPages: AnalyzeResult['recommended_pages'],
  input: GenerateInput,
): Promise<{ pages: GeneratedPage[]; usd: number }> {
  const slimAnalysis = {
    source_title: input.analysis.source_title,
    source_summary: input.analysis.source_summary,
    recommended_pages: batchPages,
  };
  const existingParts = batchPages
    .filter(p => p.action === 'update' && input.existingPages?.[p.path])
    .map(p => `### ${p.path}\n\n${input.existingPages![p.path]}`);
  const existingSection = existingParts.length > 0
    ? `EXISTING PAGES (current content — merge intelligently, do not discard):\n\n${existingParts.join('\n\n---\n\n')}`
    : '';

  const prompt = generateTemplate
    .replace('{{purpose}}', input.purpose)
    .replace('{{schema}}',  input.schema)
    .replace('{{analysis}}', JSON.stringify(slimAnalysis, null, 2))
    .replace('{{source}}',  input.sourceExcerpt.slice(0, 6000))
    .replace('{{existing_pages}}', existingSection);

  const result = await chat({
    model: 'haiku',
    system: 'You generate wiki pages.',
    messages: [{ role: 'user', content: prompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [WRITE_TOOL as any],
    maxTokens: 8192,
  });
  if (!result.toolUse || result.toolUse.name !== 'write_pages') {
    return { pages: [], usd: result.usd };
  }
  return { pages: (result.toolUse.input as { pages?: GeneratedPage[] }).pages ?? [], usd: result.usd };
}

export async function generate(input: GenerateInput): Promise<{ pages: GeneratedPage[]; usd: number }> {
  const recs = input.analysis.recommended_pages ?? [];
  const all: GeneratedPage[] = [];
  let totalUsd = 0;
  for (let i = 0; i < recs.length; i += BATCH_SIZE) {
    const batch = recs.slice(i, i + BATCH_SIZE);
    const { pages, usd } = await generateBatch(batch, input);
    all.push(...pages);
    totalUsd += usd;
  }
  return { pages: all, usd: totalUsd };
}
