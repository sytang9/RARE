import { readFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
import { analyze, type AnalyzeResult } from './analyze';
import { generate } from './generate';
import { writePage } from '../vault/page';
import { updateIndex, readIndex } from '../vault/indexFile';
import { appendLog } from '../vault/log';
import { regenerateOverview } from '../vault/overview';
import { type VaultRoot } from '../vault/root';
import { pdfToDocumentBlock, type PdfDocumentBlock } from '../sources/pdf';

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Normalize LLM-generated paths to canonical form: {concepts|entities|sources}/<slug>
const normalizePath = (p: string): string => {
  const lower = p.toLowerCase();
  for (const [singular, plural] of [['concept/', 'concepts/'], ['entity/', 'entities/'], ['source/', 'sources/']] as const) {
    const prefix = lower.startsWith(plural) ? plural : lower.startsWith(singular) ? singular : null;
    if (prefix) {
      const rawSlug = p.slice(prefix.length);
      return (lower.startsWith(plural) ? plural : plural) + toSlug(rawSlug);
    }
  }
  // unknown prefix — try to infer from content; fall back to concepts/
  const parts = p.split('/');
  if (parts.length >= 2) return 'concepts/' + toSlug(parts.slice(1).join('-'));
  return 'concepts/' + toSlug(p);
};

const typeFromPath = (p: string): 'source' | 'entity' | 'concept' => {
  if (p.startsWith('sources/')) return 'source';
  if (p.startsWith('entities/')) return 'entity';
  if (p.startsWith('concepts/')) return 'concept';
  throw new Error(`unknown page type for path: ${p}`);
};

const safeRead = async (path: string): Promise<string> => {
  try {
    return await readFileText(path);
  } catch {
    return '';
  }
};

const summaryForPage = (path: string, analysis: AnalyzeResult, rawPath: string): string => {
  const type = typeFromPath(path);
  if (type === 'source') return analysis.source_summary;
  const slug = path.split('/')[1];
  const concept = analysis.concepts.find(
    (c) => c.name.toLowerCase().replace(/\s+/g, '-') === slug,
  );
  if (concept) return concept.description;
  const entity = analysis.entities.find(
    (e) => e.name.toLowerCase().replace(/\s+/g, '-') === slug,
  );
  if (entity) return entity.description;
  return rawPath;
};

export async function ingestSource(vault: VaultRoot, rawPath: string): Promise<void> {
  const absPath = pathJoin(vault.root, rawPath);
  const isVisionPdf = rawPath.endsWith('.pdf');

  let sourceContent: string | PdfDocumentBlock;
  let sourceExcerpt: string;

  if (isVisionPdf) {
    sourceContent = await pdfToDocumentBlock(absPath);
    sourceExcerpt = ''; // filled from analysis.source_summary below
  } else {
    const text = await readFileText(absPath);
    sourceContent = text;
    sourceExcerpt = text;
  }

  const purpose = await safeRead(pathJoin(vault.root, 'purpose.md'));
  const schema = await safeRead(pathJoin(vault.root, 'schema.md'));
  const indexBody = await readIndex(vault);

  const { result: analysis, usd: analyzeUsd } = await analyze({
    sourceContent,
    purpose,
    schema,
    index: indexBody,
  });

  if (isVisionPdf) sourceExcerpt = analysis.source_summary;

  const { pages, usd: generateUsd } = await generate({
    analysis,
    purpose,
    schema,
    sourceExcerpt,
  });

  const costUsd = Math.round((analyzeUsd + generateUsd) * 1_000_000) / 1_000_000;
  const now = new Date().toISOString();

  for (const raw of pages) {
    const p = { ...raw, path: normalizePath(raw.path) };
    const type = typeFromPath(p.path);
    const slug = p.path.split('/')[1] ?? p.path;
    const headingMatch = p.body.match(/^#\s+(.+)/m);
    const title = headingMatch
      ? headingMatch[1].trim()
      : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    await writePage(vault, {
      path: p.path,
      frontmatter: { type, title, sources: [rawPath], created: now, updated: now },
      body: p.body,
    });
    const summary = summaryForPage(p.path, analysis, rawPath);
    await updateIndex(vault, { path: p.path, title, type, summary });
  }

  await appendLog(vault, {
    event: 'ingest',
    title: analysis.source_title,
    detail: { pages_written: pages.length, source: rawPath, cost_usd: costUsd },
  });

  const indexAfter = await readIndex(vault);
  await regenerateOverview(vault, purpose, indexAfter);
}
