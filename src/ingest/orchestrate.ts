import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyze, type AnalyzeResult } from './analyze';
import { generate } from './generate';
import { writePage } from '../vault/page';
import { updateIndex, readIndex } from '../vault/indexFile';
import { appendLog } from '../vault/log';
import { regenerateOverview } from '../vault/overview';
import { type VaultRoot } from '../vault/root';

const typeFromPath = (p: string): 'source' | 'entity' | 'concept' => {
  if (p.startsWith('sources/')) return 'source';
  if (p.startsWith('entities/')) return 'entity';
  if (p.startsWith('concepts/')) return 'concept';
  throw new Error(`unknown page type for path: ${p}`);
};

const safeRead = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf-8');
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
  const sourceText = await readFile(join(vault.root, rawPath), 'utf-8');
  const purpose = await safeRead(join(vault.root, 'purpose.md'));
  const schema = await safeRead(join(vault.root, 'schema.md'));
  const indexBody = await readIndex(vault);

  const analysis: AnalyzeResult = await analyze({
    sourceText,
    purpose,
    schema,
    index: indexBody,
  });

  const pages = await generate({
    analysis,
    purpose,
    schema,
    sourceExcerpt: sourceText,
  });

  const now = new Date().toISOString();

  for (const p of pages) {
    const type = typeFromPath(p.path);
    await writePage(vault, {
      path: p.path,
      frontmatter: {
        type,
        title: p.path.split('/')[1].replace(/-/g, ' '),
        sources: type === 'source' ? [] : [rawPath],
        created: now,
        updated: now,
      },
      body: p.body,
    });
    const summary = summaryForPage(p.path, analysis, rawPath);
    await updateIndex(vault, { path: p.path, title: p.path, type, summary });
  }

  await appendLog(vault, {
    event: 'ingest',
    title: analysis.source_title,
    detail: { pages_written: pages.length, source: rawPath },
  });

  const indexAfter = await readIndex(vault);
  await regenerateOverview(vault, purpose, indexAfter);
}
