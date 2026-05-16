import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from '../llm/anthropic';
import { detectOrphans, detectDeadLinks } from './detect';
import { listPages } from '../vault/page';
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

export async function runLint(vault: VaultRoot): Promise<void> {
  const orphans = await detectOrphans(vault);
  const deadLinks = await detectDeadLinks(vault);
  const pages = await listPages(vault);
  const indexBody = await readIndex(vault);

  const __dir = dirname(fileURLToPath(import.meta.url));
  const template = await readFile(join(__dir, '../../prompts/lint.md'), 'utf-8');
  const pagesBlock = pages.map(p => `### ${p.path}\n${p.body.slice(0, 1000)}`).join('\n\n');
  const prompt = template.replace('{{index}}', indexBody).replace('{{pages}}', pagesBlock);

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
    contradictions: Array.isArray(raw.contradictions) ? raw.contradictions as Array<{ pages: string[]; description: string }> : [],
    suggested_cross_refs: Array.isArray(raw.suggested_cross_refs) ? raw.suggested_cross_refs as Array<{ from: string; to: string; snippet: string }> : [],
    stale_claims: Array.isArray(raw.stale_claims) ? raw.stale_claims as Array<{ page: string; reason: string }> : [],
  };

  const today = new Date().toISOString().slice(0, 10);
  const report = [
    `# Lint ${today}`,
    '',
    '## Orphans',
    ...orphans.map(o => `- [[${o}]]`),
    '',
    '## Dead links',
    ...deadLinks.map(d => `- [[${d.from}]] → \`${d.to}\` (target missing)`),
    '',
    '## Contradictions',
    ...findings.contradictions.map(c => `- ${c.pages.map(p => `[[${p}]]`).join(' ↔ ')}: ${c.description}`),
    '',
    '## Suggested cross-references',
    ...findings.suggested_cross_refs.map(s => `- [[${s.from}]] should link to [[${s.to}]] (mentions: "${s.snippet}")`),
    '',
    '## Stale claims',
    ...findings.stale_claims.map(s => `- [[${s.page}]]: ${s.reason}`),
  ].join('\n');

  await mkdir(join(wikiDir(vault), 'lint'), { recursive: true });
  await writeFile(join(wikiDir(vault), 'lint', `${today}.md`), report, 'utf-8');
  await appendLog(vault, {
    event: 'lint',
    title: today,
    detail: {
      orphans: orphans.length,
      dead_links: deadLinks.length,
      cost_usd: result.usd,
    },
  });
}
