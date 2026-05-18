import { describe, it, expect, beforeEach } from 'vitest';
import '../__mocks__/anthropic';
import { mockChatOnce, resetAnthropicMocks } from '../__mocks__/anthropic';
import { generate } from '../../src/ingest/generate';
import analyzeFixture from '../fixtures/analyze-v1.json';

describe('ingest.generate', () => {
  beforeEach(() => resetAnthropicMocks());

  it('returns one body per recommended page', async () => {
    mockChatOnce({
      toolUse: {
        name: 'write_pages',
        input: {
          pages: analyzeFixture.recommended_pages.map(p => ({
            path: p.path,
            body: `# ${p.path}\n\nGenerated body referencing [[concepts/cosine-similarity]].`,
          })),
        },
      },
    });
    const { pages } = await generate({
      analysis: analyzeFixture,
      purpose: '',
      schema: '',
      sourceExcerpt: '...',
    });
    expect(pages).toHaveLength(analyzeFixture.recommended_pages.length);
    for (const p of pages) {
      expect(p.body).toMatch(/^# /m);
      expect(p.path).toMatch(/^(concepts|entities|sources)\//);
    }
  });

  it('generate prompt template is snapshotted', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const template = readFileSync(join(dir, '../../prompts/generate.md'), 'utf-8');
    expect(template).toMatchSnapshot();
  });
});
