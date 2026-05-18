import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../__mocks__/anthropic';
import { mockChatOnce, resetAnthropicMocks } from '../__mocks__/anthropic';
import { findRelevantPages } from '../../src/retrieve/findRelevantPages';

describe('retrieve.findRelevantPages', () => {
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
  });

  it('returns the pages the LLM picks, reading them from disk', async () => {
    mockChatOnce({
      toolUse: { name: 'pick_pages', input: { paths: ['concepts/foo'] } },
    });
    const pages = await findRelevantPages('what is foo?', { root: dir });
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('concepts/foo');
    expect(pages[0].body).toContain('A foo concept');
    await rm(dir, { recursive: true, force: true });
  });

  it('returns [] when LLM does not call pick_pages', async () => {
    mockChatOnce({ text: 'I cannot answer that.' });
    const pages = await findRelevantPages('what is foo?', { root: dir });
    expect(pages).toHaveLength(0);
    await rm(dir, { recursive: true, force: true });
  });

  it('skips hallucinated paths that do not exist on disk', async () => {
    mockChatOnce({
      toolUse: { name: 'pick_pages', input: { paths: ['concepts/does-not-exist', 'concepts/foo'] } },
    });
    const pages = await findRelevantPages('what is foo?', { root: dir });
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('concepts/foo');
    await rm(dir, { recursive: true, force: true });
  });
});
