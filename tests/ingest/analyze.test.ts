import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    const { result } = await analyze({
      sourceContent: 'irrelevant — LLM is mocked',
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
      analyze({ sourceContent: 'x', purpose: '', schema: '', index: '' }),
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

  it('builds multimodal messages when sourceContent is a document block', async () => {
    const { analyze: analyzeLocal } = await import('../../src/ingest/analyze');
    const { chat } = await import('../../src/llm/anthropic');
    const chatMock = vi.mocked(chat);
    chatMock.mockResolvedValueOnce({
      text: '',
      toolUse: {
        name: 'record_analysis',
        input: {
          source_title: 'Test',
          source_summary: 'summary',
          entities: [],
          concepts: [],
          connections: [],
          contradictions: [],
          recommended_pages: [],
        },
      },
      inputTokens: 100,
      outputTokens: 50,
      usd: 0.001,
    });

    const block = {
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: 'abc=' },
    };

    await analyzeLocal({ sourceContent: block, purpose: '', schema: '', index: '' });

    const callArgs = chatMock.mock.calls[chatMock.mock.calls.length - 1][0];
    // messages content should be an array (multimodal) not a plain string
    expect(Array.isArray(callArgs.messages[0].content)).toBe(true);
  });
});
