// Cost utilities for RARE — per-tier USD calculation and log aggregation

export type Tier = 'haiku' | 'sonnet';

// Prices per million tokens (input/output) as of Anthropic pricing
const PRICE_PER_M: Record<Tier, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.0, output: 15.0 },
};

export function computeUsd(
  tier: Tier,
  tokens: { input: number; output: number },
): number {
  const p = PRICE_PER_M[tier];
  const raw = (tokens.input * p.input + tokens.output * p.output) / 1_000_000;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export function sumLogCosts(logText: string, yearMonth: string): number {
  const entries = logText.split(/\n## \[/).slice(1);
  let total = 0;
  for (const e of entries) {
    if (!e.startsWith(yearMonth)) continue;
    const m = e.match(/cost_usd"?:\s*([0-9.]+)/);
    if (m) total += parseFloat(m[1]);
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

export interface CostByDay {
  date: string;
  ingest: number;
  chat: number;
  lint: number;
}

export interface CostBreakdown {
  total: number;
  byType: { ingest: number; chat: number; lint: number };
  byDay: CostByDay[];
}

export function parseCostLog(logText: string): CostBreakdown {
  const entries = logText.split(/\n## \[/).slice(1);
  const dayMap = new Map<string, { ingest: number; chat: number; lint: number }>();

  for (const e of entries) {
    const dateMatch = e.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];

    // event type is after the date+time, before " | "
    const typeMatch = e.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] (\w+) \|/);
    if (!typeMatch) continue;
    const rawType = typeMatch[1];
    // log event "query" is exposed as "chat"
    const type: 'ingest' | 'chat' | 'lint' =
      rawType === 'ingest' ? 'ingest' :
      rawType === 'query'  ? 'chat'   :
      rawType === 'lint'   ? 'lint'   : 'chat';

    const costMatch = e.match(/cost_usd"?:\s*([0-9.]+)/);
    if (!costMatch) continue;
    const cost = parseFloat(costMatch[1]);

    const day = dayMap.get(date) ?? { ingest: 0, chat: 0, lint: 0 };
    day[type] = Math.round((day[type] + cost) * 1_000_000) / 1_000_000;
    dayMap.set(date, day);
  }

  const byDay: CostByDay[] = Array.from(dayMap.entries())
    .map(([date, costs]) => ({ date, ...costs }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const byType = { ingest: 0, chat: 0, lint: 0 };
  for (const day of byDay) {
    byType.ingest = Math.round((byType.ingest + day.ingest) * 1_000_000) / 1_000_000;
    byType.chat   = Math.round((byType.chat   + day.chat)   * 1_000_000) / 1_000_000;
    byType.lint   = Math.round((byType.lint   + day.lint)   * 1_000_000) / 1_000_000;
  }

  const total = Math.round((byType.ingest + byType.chat + byType.lint) * 1_000_000) / 1_000_000;
  return { total, byType, byDay };
}
