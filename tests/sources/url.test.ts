import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../../src/sources/url';

describe('sources.url.htmlToMarkdown', () => {
  it('extracts article body and converts to markdown', () => {
    const html = `<html><head><title>X</title></head>
      <body><article><h1>Hello</h1><p>World <strong>bold</strong></p></article></body></html>`;
    const result = htmlToMarkdown(html, 'https://example.com/x');
    expect(result.title).toBe('X');
    expect(result.markdown).toContain('Hello');
    expect(result.markdown).toContain('**bold**');
  });
});
