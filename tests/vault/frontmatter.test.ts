import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../../src/vault/frontmatter';

describe('vault.frontmatter', () => {
  it('round-trips a page with frontmatter', () => {
    const input = `---
type: concept
title: Cosine Similarity
sources:
  - raw/sources/a.md
created: 2026-05-16T14:32:00Z
updated: 2026-05-16T14:32:00Z
---

# Cosine Similarity
body text here`;
    const parsed = parseFrontmatter(input);
    expect(parsed.data.type).toBe('concept');
    expect(parsed.data.title).toBe('Cosine Similarity');
    expect(parsed.data.sources).toEqual(['raw/sources/a.md']);
    expect(parsed.body.trim().startsWith('# Cosine Similarity')).toBe(true);

    const rebuilt = stringifyFrontmatter(parsed);
    const reparsed = parseFrontmatter(rebuilt);
    expect(reparsed.data).toEqual(parsed.data);
    // gray-matter.stringify adds a trailing newline, so body may gain one
    expect(reparsed.body.trim()).toBe(parsed.body.trim());
  });
  it('handles a page with no frontmatter', () => {
    const parsed = parseFrontmatter('hello world');
    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe('hello world');
  });
});
