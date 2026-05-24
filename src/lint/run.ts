import lintTemplate from '../../prompts/lint.md?raw';
import { writeFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
import { chat } from '../llm/anthropic';
import { detectOrphans, detectDeadLinks } from './detect';
import { listPages, readPage, writePage } from '../vault/page';
import { readIndex } from '../vault/indexFile';
import { appendLog } from '../vault/log';
import { wikiDir, type VaultRoot } from '../vault/root';

const LINT_TOOL = {
  name: 'record_lint_findings',
  description: 'Record contradictions, suggested cross-refs, stale claims.',
  input_schema: {
    type: 'object' as const,
    properties: {
      contradictions: { type: 'array' },
      suggested_cross_refs: { type: 'array' },
      stale_claims: { type: 'array' },
    },
    required: ['contradictions', 'suggested_cross_refs', 'stale_claims'],
  },
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Insert [[slug|snippet]] into body for every occurrence of snippet that isn't
// already inside a [[...]] wikilink. Skips the page entirely if the target slug
// is already linked anywhere (avoids double-linking).
const applyWikilink = (body: string, snippet: string, slug: string): string => {
  if (body.includes(`[[${slug}|`) || body.includes(`[[${slug}]]`)) return body;
  const escaped = escapeRegex(snippet);
  // Split on existing wikilinks; only replace in the interstitial (non-link) parts.
  const parts = body.split(/(\[\[[^\]]+\]\])/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // inside existing [[...]] — leave untouched
      return part.replace(new RegExp(escaped, 'g'), `[[${slug}|${snippet}]]`);
    })
    .join('');
};

export async function runLint(vault: VaultRoot): Promise<void> {
  const orphans = await detectOrphans(vault);
  const deadLinks = await detectDeadLinks(vault);
  const pages = await listPages(vault);
  const indexBody = await readIndex(vault);

  const pagesBlock = pages.map(p => `### ${p.path}\n${p.body.slice(0, 1000)}`).join('\n\n');
  const prompt = lintTemplate.replace('{{index}}', indexBody).replace('{{pages}}', pagesBlock);

  const result = await chat({
    model: 'haiku',
    system: 'You lint a personal wiki.',
    messages: [{ role: 'user', content: prompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [LINT_TOOL as any],
    maxTokens: 2048,
  });

  if (!result.toolUse) throw new Error('lint: expected tool_use(record_lint_findings)');

  const raw = result.toolUse.input as Record<string, unknown>;
  const findings = {
    contradictions: Array.isArray(raw.contradictions)
      ? raw.contradictions as Array<{ pages: string[]; description: string }>
      : [],
    suggested_cross_refs: Array.isArray(raw.suggested_cross_refs)
      ? raw.suggested_cross_refs as Array<{ from: string; to: string; snippet: string }>
      : [],
    stale_claims: Array.isArray(raw.stale_claims)
      ? raw.stale_claims as Array<{ page: string; reason: string }>
      : [],
  };

  // Auto-apply suggested cross-refs: insert [[slug|snippet]] in place wherever
  // the source page mentions the concept/entity without linking to it.
  let autoApplied = 0;
  const skipped: Array<{ from: string; to: string; snippet: string }> = [];

  for (const ref of findings.suggested_cross_refs) {
    try {
      const page = await readPage(vault, ref.from);
      const slug = ref.to.split('/').pop()!;
      const newBody = applyWikilink(page.body, ref.snippet, slug);
      if (newBody !== page.body) {
        await writePage(vault, { path: ref.from, frontmatter: page.frontmatter, body: newBody });
        autoApplied++;
      }
    } catch {
      // Page unreadable or write failed — report as skipped so nothing is lost.
      skipped.push(ref);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const report = [
    `# Lint ${today}`,
    '',
    '## Orphans',
    orphans.length ? orphans.map(o => `- [[${o}]]`).join('\n') : '_none_',
    '',
    '## Dead links',
    deadLinks.length
      ? deadLinks.map(d => `- [[${d.from}]] → \`${d.to}\` (target missing)`).join('\n')
      : '_none_',
    '',
    '## Contradictions',
    findings.contradictions.length
      ? findings.contradictions
          .map(c => `- ${c.pages.map(p => `[[${p}]]`).join(' ↔ ')}: ${c.description}`)
          .join('\n')
      : '_none_',
    '',
    `## Cross-references auto-applied (${autoApplied})`,
    autoApplied
      ? findings.suggested_cross_refs
          .filter(r => !skipped.includes(r))
          .map(s => `- [[${s.from}]] → added \`[[${s.to.split('/').pop()}|${s.snippet}]]\``)
          .join('\n')
      : '_none_',
    ...(skipped.length
      ? [
          '',
          `## Cross-references skipped (${skipped.length})`,
          skipped
            .map(s => `- [[${s.from}]] should link to [[${s.to}]] (mentions: "${s.snippet}") — could not apply`)
            .join('\n'),
        ]
      : []),
    '',
    '## Stale claims',
    findings.stale_claims.length
      ? findings.stale_claims.map(s => `- [[${s.page}]]: ${s.reason}`).join('\n')
      : '_none_',
  ].join('\n');

  await writeFileText(pathJoin(wikiDir(vault), 'lint', `${today}.md`), report);
  await appendLog(vault, {
    event: 'lint',
    title: today,
    detail: {
      orphans: orphans.length,
      dead_links: deadLinks.length,
      cross_refs_applied: autoApplied,
      cost_usd: result.usd,
    },
  });
}
