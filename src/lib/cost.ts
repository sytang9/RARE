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
