import { listPages } from './page';
import { extractWikilinks } from './wikilinks';
import type { VaultRoot } from './root';

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'entity' | 'source';
  val: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export async function buildGraph(vault: VaultRoot): Promise<GraphData> {
  const pages = await listPages(vault);

  const slugToPath = new Map<string, string>();
  for (const p of pages) {
    slugToPath.set(p.path.split('/').pop()!, p.path);
  }

  const nodes: GraphNode[] = pages.map(p => ({
    id:    p.path,
    label: p.frontmatter.title ?? p.path.split('/').pop()!,
    type:  p.frontmatter.type,
    val:   1,
  }));

  const pathSet = new Set(pages.map(p => p.path));
  const seen    = new Set<string>();
  const links:  GraphLink[] = [];

  for (const page of pages) {
    for (const raw of extractWikilinks(page.body)) {
      const target = pathSet.has(raw) ? raw : slugToPath.get(raw);
      if (!target || target === page.path) continue;
      const key = `${page.path}→${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: page.path, target });
    }
  }

  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  for (const n of nodes) {
    n.val = Math.max(1, degree.get(n.id) ?? 1);
  }

  return { nodes, links };
}
