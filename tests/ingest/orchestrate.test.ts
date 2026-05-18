import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../__mocks__/anthropic';
import { mockChat, resetAnthropicMocks } from '../__mocks__/anthropic';
import { ingestSource } from '../../src/ingest/orchestrate';
import analyzeFixture from '../fixtures/analyze-v1.json';

describe('ingest.orchestrate (integration)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rare-'));
    resetAnthropicMocks();
    await mkdir(join(dir, 'raw', 'sources'), { recursive: true });
    await writeFile(
      join(dir, 'raw', 'sources', 'intro.md'),
      '# Intro to Similarity Metrics\n\nCosine vs Euclidean.',
      'utf-8',
    );
  });

  it('writes source/entity/concept pages and updates index+log+overview', async () => {
    // Step 1: analyze returns the fixture
    mockChat.mockResolvedValueOnce({
      text: '',
      toolUse: { name: 'record_analysis', input: analyzeFixture },
      inputTokens: 1000, outputTokens: 500, usd: 0.003,
    });
    // Step 2: generate returns bodies
    mockChat.mockResolvedValueOnce({
      text: '',
      toolUse: {
        name: 'write_pages',
        input: {
          pages: analyzeFixture.recommended_pages.map(p => ({
            path: p.path,
            body: `# ${p.path.split('/')[1]}\n\nBody with [[concepts/cosine-similarity]].`,
          })),
        },
      },
      inputTokens: 1500, outputTokens: 1200, usd: 0.008,
    });
    // Step 3: overview regen
    mockChat.mockResolvedValueOnce({
      text: '# Overview\n\nCovers similarity metrics.',
      inputTokens: 200, outputTokens: 100, usd: 0.001,
    });

    await ingestSource({ root: dir }, 'raw/sources/intro.md');

    // Wiki pages exist with frontmatter
    const conceptBody = await readFile(join(dir, 'wiki', 'concepts/cosine-similarity.md'), 'utf-8');
    expect(conceptBody).toMatch(/^---/);
    expect(conceptBody).toContain('Body');
    // Index updated
    const index = await readFile(join(dir, 'wiki', 'index.md'), 'utf-8');
    expect(index).toContain('[[concepts/cosine-similarity]]');
    // Log appended
    const log = await readFile(join(dir, 'wiki', 'log.md'), 'utf-8');
    expect(log).toMatch(/ingest \|/);
    // Overview written
    const overview = await readFile(join(dir, 'wiki', 'overview.md'), 'utf-8');
    expect(overview.length).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });
});
