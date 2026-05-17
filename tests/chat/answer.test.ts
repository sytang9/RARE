import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../__mocks__/anthropic';
import { mockChat, resetAnthropicMocks } from '../__mocks__/anthropic';
import { chat } from '../../src/llm/anthropic';
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

    const vault = { root: dir };
    const result = await answer('what is foo?', [], vault);
    expect(result.text).toContain('[[concepts/foo]]');
    expect(result.citations).toContain('concepts/foo');
    expect(result.cost.usd).toBeGreaterThan(0);
    await rm(dir, { recursive: true, force: true });
  });

  it('forwards model and thinking to the LLM', async () => {
    const chatMock = vi.mocked(chat);
    // First call: findRelevantPages pick_pages tool
    chatMock.mockResolvedValueOnce({
      text: '',
      toolUse: { name: 'pick_pages', input: { paths: [] } },
      inputTokens: 10,
      outputTokens: 5,
      usd: 0.001,
    });
    // Second call: the actual answer — this is what we assert opts on
    chatMock.mockResolvedValueOnce({
      text: 'ok',
      inputTokens: 10,
      outputTokens: 5,
      usd: 0.001,
    });

    const vault = { root: dir };
    await answer('what is X?', [], vault, { model: 'opus', thinking: true });

    const callOpts = chatMock.mock.calls[chatMock.mock.calls.length - 1][0];
    expect(callOpts.model).toBe('opus');
    expect(callOpts.thinking).toEqual({ type: 'enabled', budget_tokens: 8000 });
    await rm(dir, { recursive: true, force: true });
  });
});
