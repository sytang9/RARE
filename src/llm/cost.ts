export type ModelTier = 'haiku' | 'sonnet';

const PRICING: Record<ModelTier, { inputPerMtok: number; outputPerMtok: number }> = {
  haiku:  { inputPerMtok: 1, outputPerMtok: 5 },
  sonnet: { inputPerMtok: 3, outputPerMtok: 15 },
};

export function computeUsd(
  tier: ModelTier,
  tokens: { input: number; output: number },
): number {
  const p = PRICING[tier];
  const usd = (tokens.input / 1_000_000) * p.inputPerMtok
            + (tokens.output / 1_000_000) * p.outputPerMtok;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
