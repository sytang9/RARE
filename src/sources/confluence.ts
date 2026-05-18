export interface ConfluenceCreds {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface ConfluenceExtractResult {
  title: string;
  markdown: string;
  sourceUrl: string;
}

const CONFLUENCE_PATTERNS = [
  /https?:\/\/[^/]+\.atlassian\.net\/wiki\//,
  /https?:\/\/[^/]+\/wiki\/spaces\//,
];

export function isConfluenceUrl(url: string): boolean {
  return CONFLUENCE_PATTERNS.some(p => p.test(url));
}

export function extractPageIdFromUrl(url: string): string | null {
  // Handles:
  //   /wiki/spaces/SPACE/pages/12345678/...
  //   /wiki/spaces/SPACE/pages/12345678
  const m = url.match(/\/pages\/(\d+)/);
  return m ? m[1] : null;
}

export async function fetchConfluencePage(
  url: string,
  creds: ConfluenceCreds,
): Promise<ConfluenceExtractResult> {
  const pageId = extractPageIdFromUrl(url);
  if (!pageId) throw new Error(`Could not extract Confluence page ID from URL: ${url}`);

  const base = creds.baseUrl.replace(/\/$/, '');
  const apiUrl = `${base}/wiki/rest/api/content/${pageId}?expand=body.view,title`;

  const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
  const resp = await fetch(apiUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Confluence API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    title: string;
    body: { view: { value: string } };
  };

  const title = data.title ?? 'Untitled';
  const html = data.body?.view?.value ?? '';

  // Convert HTML → markdown using TurndownService (same as url.ts)
  const TurndownService = (await import('turndown')).default;
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const markdown = td.turndown(html);

  return { title, markdown, sourceUrl: url };
}
