import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface UrlExtractResult {
  title: string;
  markdown: string;
  sourceUrl: string;
}

export function htmlToMarkdown(html: string, url: string): UrlExtractResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Readability resolves relative links against the document URL — set via <base>.
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const reader = new Readability(doc as unknown as Document);
  const article = reader.parse();
  if (!article) throw new Error('Could not extract article');
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  return { title: article.title ?? url, markdown: td.turndown(article.content), sourceUrl: url };
}
