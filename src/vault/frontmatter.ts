import matter from 'gray-matter';

export interface ParsedPage {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedPage {
  const parsed = matter(raw);
  return { data: parsed.data, body: parsed.content };
}

export function stringifyFrontmatter(parsed: ParsedPage): string {
  return matter.stringify(parsed.body, parsed.data);
}
