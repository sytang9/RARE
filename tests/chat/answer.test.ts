import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../__mocks__/anthropic';
import { mockChat, resetAnthropicMocks } from '../__mocks__/anthropic';
import { answer } from '../../src/chat/answer';

describe('chat.answer', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rare-'));
    resetAnthropicMocks();
    await mkdir(join(dir, 'wiki', 'concepts'), { recursive: true });
    await writeFile(join(dir, 'wiki', 'index.md'), '## Concepts\n- [[concepts/foo]] — a foo', 'utf-8');
    await writeFile(
      join(dir, 'wiki', 'concepts/foo.md'),
      `---\ntype: concept\ntitle: Foo\nsources: []\ncreated: ""\nupdated: ""\n---\n\n# Foo\n\nA foo concept.`,
      'utf-8',
    );
    await writeFile(join(dir, 'wiki', 'log.md'), '', 'utf-8');
  });

  it('retrieves pages, calls Sonnet, returns cited answer', async () => {
    // findRelevantPages call (first chat call — pick_pages tool)
    mockChat.mockResolvedValueOnce({
      text: '',
      toolUse: { name: 'pick_pages', input: { paths: ['concepts/foo'] } },
      inputTokens: 100, outputTokens: 50, usd: 0.001,
    });
    // answer call (second chat call — Sonnet text response)
    mockChat.mockResolvedValueOnce({
      text: 'A foo is described in [[concepts/foo]].',
      inputTokens: 500, outputTokens: 80, usd: 0.005,
    });

    const result = await answer('what is foo?', [], { root: dir });
    expect(result.text).toContain('[[concepts/foo]]');
    expect(result.citations).toContain('concepts/foo');
    expect(result.cost.usd).toBeGreaterThan(0);
    await rm(dir, { recursive: true, force: true });
  });
});
