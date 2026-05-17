import analyzeTemplate from '../../prompts/analyze.md?raw';
import { chat } from '../llm/anthropic';

export interface AnalyzeInput {
  sourceText: string;
  purpose: string;
  schema: string;
  index: string;
}

export interface AnalyzeResult {
  source_title: string;
  source_summary: string;
  entities: Array<{ name: string; type: string; description: string; is_new: boolean }>;
  concepts: Array<{ name: string; description: string; is_new: boolean }>;
  connections: Array<{ target_page: string; relation: string }>;
  contradictions: Array<{ existing_page: string; conflict: string }>;
  recommended_pages: Array<{ action: 'create' | 'update'; path: string; rationale: string }>;
}

const ANALYZE_TOOL = {
  name: 'record_analysis',
  description: 'Record a structured analysis of the source.',
  input_schema: {
    type: 'object',
    properties: {
      source_title: { type: 'string' },
      source_summary: { type: 'string' },
      entities: { type: 'array', items: { type: 'object' } },
      concepts: { type: 'array', items: { type: 'object' } },
      connections: { type: 'array', items: { type: 'object' } },
      contradictions: { type: 'array', items: { type: 'object' } },
      recommended_pages: { type: 'array', items: { type: 'object' } },
    },
    required: [
      'source_title', 'source_summary', 'entities', 'concepts',
      'connections', 'contradictions', 'recommended_pages',
    ],
  },
} as const;

export async function analyze(input: AnalyzeInput): Promise<{ result: AnalyzeResult; usd: number }> {
  const prompt = analyzeTemplate
    .replace('{{purpose}}', input.purpose)
    .replace('{{schema}}',  input.schema)
    .replace('{{index}}',   input.index)
    .replace('{{source}}',  input.sourceText);

  const resp = await chat({
    model: 'haiku',
    system: 'You analyze sources for a personal knowledge wiki.',
    messages: [{ role: 'user', content: prompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [ANALYZE_TOOL as any],
    maxTokens: 4096,
  });

  if (!resp.toolUse || resp.toolUse.name !== 'record_analysis') {
    throw new Error('Expected tool_use(record_analysis); got none');
  }
  return { result: resp.toolUse.input as AnalyzeResult, usd: resp.usd };
}
