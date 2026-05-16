import { describe, it, expect } from 'vitest';
import { extractWikilinks } from '../../src/vault/wikilinks';

describe('vault.wikilinks', () => {
  it('extracts simple wikilinks', () => {
    expect(extractWikilinks('see [[concepts/foo]] and [[entities/bar]]'))
      .toEqual(['concepts/foo', 'entities/bar']);
  });
  it('ignores non-wikilink brackets', () => {
    expect(extractWikilinks('use [link](url) not [[xx]]')).toEqual(['xx']);
  });
  it('deduplicates', () => {
    expect(extractWikilinks('[[a]] [[a]] [[b]]')).toEqual(['a', 'b']);
  });
});
