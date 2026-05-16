import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../__mocks__/anthropic';
import { mockChat, resetAnthropicMocks } from '../__mocks__/anthropic';
import { runLint } from '../../src/lint/run';

describe('lint.run', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rare-'));
    resetAnthropicMocks();
    await mkdir(join(dir, 'wiki', 'concepts'), { recursive: true });
    await writeFile(join(dir, 'wiki', 'index.md'), '## Concepts\n- [[concepts/a]] — a', 'utf-8');
    await writeFile(
      join(dir, 'wiki', 'concepts/a.md'),
      `---\ntype: concept\ntitle: A\nsources: []\ncreated: ""\nupdated: ""\n---\n\n# A`,
      'utf-8',
    );
    await writeFile(join(dir, 'wiki', 'log.md'), '', 'utf-8');
  });

  it('writes a lint report with the four required sections', async () => {
    mockChat.mockResolvedValueOnce({
      text: '',
      toolUse: {
        name: 'record_lint_findings',
        input: { contradictions: [], suggested_cross_refs: [], stale_claims: [] },
      },
      inputTokens: 100, outputTokens: 30, usd: 0.0005,
    });
    await runLint({ root: dir });
    const today = new Date().toISOString().slice(0, 10);
    const report = await readFile(join(dir, 'wiki', 'lint', `${today}.md`), 'utf-8');
    expect(report).toContain('# Lint');
    expect(report).toMatch(/## Orphans/);
    expect(report).toMatch(/## Dead links/);
    expect(report).toMatch(/## Contradictions/);
    expect(report).toMatch(/## Suggested cross-references/);
    expect(report).toMatch(/## Stale claims/);
    const log = await readFile(join(dir, 'wiki', 'log.md'), 'utf-8');
    expect(log).toContain('lint');
    await rm(dir, { recursive: true, force: true });
  });
});
