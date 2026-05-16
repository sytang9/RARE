import { listPages } from '../vault/page';
import { extractWikilinks } from '../vault/wikilinks';
import type { VaultRoot } from '../vault/root';

export async function detectOrphans(vault: VaultRoot): Promise<string[]> {
  const pages = await listPages(vault);
  const inbound = new Set<string>();
  for (const p of pages) {
    for (const link of extractWikilinks(p.body)) inbound.add(link);
  }
  return pages.filter(p => !inbound.has(p.path)).map(p => p.path);
}

export interface DeadLink { from: string; to: string; }

export async function detectDeadLinks(vault: VaultRoot): Promise<DeadLink[]> {
  const pages = await listPages(vault);
  const existing = new Set(pages.map(p => p.path));
  const dead: DeadLink[] = [];
  for (const p of pages) {
    for (const link of extractWikilinks(p.body)) {
      if (!existing.has(link)) dead.push({ from: p.path, to: link });
    }
  }
  return dead;
}
