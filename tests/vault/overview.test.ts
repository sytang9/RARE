import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../__mocks__/anthropic';
import { mockChatOnce, resetAnthropicMocks } from '../__mocks__/anthropic';
import { regenerateOverview } from '../../src/vault/overview';

describe('vault.overview', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rare-')); resetAnthropicMocks(); });

  it('writes overview.md from LLM output', async () => {
    mockChatOnce({ text: '# Overview\n\nThis vault covers [[concepts/foo]].' });
    await regenerateOverview({ root: dir }, '', '## Concepts\n- [[concepts/foo]] — foo');
    const content = await readFile(join(dir, 'wiki', 'overview.md'), 'utf-8');
    expect(content).toContain('Overview');
    expect(content.length).toBeGreaterThan(0);
    await rm(dir, { recursive: true, force: true });
  });
});
