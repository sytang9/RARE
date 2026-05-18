import { describe, it, expect } from 'vitest';

// Unit test for the logic that detects and extracts wiki: hrefs
function isWikiHref(href: string): boolean {
  return href.includes('wiki:');
}

function extractWikiTarget(href: string): string {
  return decodeURIComponent(href.split('wiki:')[1]);
}

describe('WikiView wikilink href detection', () => {
  it('detects bare wiki: scheme', () => {
    expect(isWikiHref('wiki:attention')).toBe(true);
  });

  it('detects browser-resolved absolute wiki: href', () => {
    expect(isWikiHref('http://localhost:3100/wiki:attention')).toBe(true);
  });

  it('does not match regular https links', () => {
    expect(isWikiHref('https://example.com')).toBe(false);
  });

  it('extracts target from bare wiki: href', () => {
    expect(extractWikiTarget('wiki:attention%20mechanism')).toBe('attention mechanism');
  });

  it('extracts target from browser-resolved href', () => {
    expect(extractWikiTarget('http://localhost:3100/wiki:attention%20mechanism')).toBe('attention mechanism');
  });
});
