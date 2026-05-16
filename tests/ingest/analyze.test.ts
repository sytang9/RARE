import { describe, it, expect, beforeEach } from 'vitest';
import '../__mocks__/anthropic';
import { mockChatOnce, resetAnthropicMocks } from '../__mocks__/anthropic';
import { analyze } from '../../src/ingest/analyze';

describe('ingest.analyze', () => {
  beforeEach(() => resetAnthropicMocks());

  it('returns an AnalyzeResult with required fields', async () => {
    mockChatOnce({
      text: '',
      toolUse: {
        name: 'record_analysis',
        input: {
          source_title: 'Test',
          source_summary: 'A test source.',
          entities: [{ name: 'Alice', type: 'person', description: 'researcher', is_new: true }],
          concepts: [{ name: 'Cosine Similarity', description: 'angle-based', is_new: true }],
          connections: [],
          contradictions: [],
          recommended_pages: [
            { action: 'create', path: 'concepts/cosine-similarity', rationale: 'central' },
          ],
        },
      },
    });
    const result = await analyze({
      sourceText: 'irrelevant — LLM is mocked',
      purpose: '',
      schema: '',
      index: '',
    });
    expect(result).toMatchObject({
      source_title: expect.any(String),
      source_summary: expect.any(String),
      entities: expect.any(Array),
      concepts: expect.any(Array),
      connections: expect.any(Array),
      contradictions: expect.any(Array),
      recommended_pages: expect.any(Array),
    });
    expect(result.recommended_pages[0]).toHaveProperty('action');
    expect(result.recommended_pages[0]).toHaveProperty('path');
  });

  it('throws when the LLM returns no tool_use', async () => {
    mockChatOnce({ text: 'forgot to call tool', toolUse: undefined });
    await expect(
      analyze({ sourceText: 'x', purpose: '', schema: '', index: '' }),
    ).rejects.toThrow(/tool_use/i);
  });

  it('prompt template is snapshotted', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const template = readFileSync(join(dir, '../../prompts/analyze.md'), 'utf-8');
    expect(template).toMatchSnapshot();
  });
});
