import { describe, it, expect } from 'vitest';
import { sumLogCosts } from '../../src/lib/cost';

describe('lib.cost.sumLogCosts', () => {
  it('extracts cost_usd from log entries within a month', () => {
    const log = `
## [2026-05-01 10:00] ingest | A
- cost_usd: 0.05
- pages_written: 3

## [2026-05-20 11:00] query | q
- cost_usd: 0.01

## [2026-04-30 09:00] ingest | B
- cost_usd: 0.99
`;
    expect(sumLogCosts(log, '2026-05')).toBeCloseTo(0.06, 4);
  });
});
