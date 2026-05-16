import { describe, it, expect } from 'vitest';
import { computeUsd } from '../../src/llm/cost';

describe('llm.cost.computeUsd', () => {
  it('prices Haiku input + output tokens', () => {
    const usd = computeUsd('haiku', { input: 1_000_000, output: 1_000_000 });
    expect(usd).toBeCloseTo(6.0, 2);
  });
  it('prices Sonnet input + output tokens', () => {
    const usd = computeUsd('sonnet', { input: 1_000_000, output: 1_000_000 });
    expect(usd).toBeCloseTo(18.0, 2);
  });
});
