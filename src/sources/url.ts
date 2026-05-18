import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface UrlExtractResult {
  title: string;
  markdown: string;
  sourceUrl: string;
}

async function buildDoc(html: string, url: string): Promise<Document> {
  if (typeof window !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = doc.createElement('base');
    base.href = url;
    doc.head.prepend(base);
    return doc;
  }
  // Node.js server path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { JSDOM } = (await import('jsdom')) as any;
  return new JSDOM(html, { url }).window.document as unknown as Document;
}

export async function htmlToMarkdown(html: string, url: string): Promise<UrlExtractResult> {
  const doc = await buildDoc(html, url);
  const reader = new Readability(doc as unknown as Document);
  const article = reader.parse();
  if (!article) throw new Error('Could not extract article');
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  return { title: article.title ?? url, markdown: td.turndown(article.content ?? ''), sourceUrl: url };
}
