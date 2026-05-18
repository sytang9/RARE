const WIKILINK = /\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g;

export function extractWikilinks(markdown: string): string[] {
  const seen = new Set<string>();
  for (const match of markdown.matchAll(WIKILINK)) {
    seen.add(match[1].trim());
  }
  return [...seen];
}
