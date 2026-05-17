import { describe, it, expect } from 'vitest';
import { sumLogCosts, parseCostLog } from '../../src/lib/cost';

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

describe('lib.cost.parseCostLog', () => {
  const LOG = `
## [2026-05-17 10:00] ingest | A
- source: "raw/sources/a.md"
- cost_usd: 0.099

## [2026-05-17 11:00] query | q1
- cost_usd: 0.054

## [2026-05-18 09:00] lint | daily
- cost_usd: 0.027

## [2026-05-18 14:00] ingest | B
- source: "raw/sources/b.md"
- cost_usd: 0.082
`;

  it('sums by type correctly', () => {
    const { byType } = parseCostLog(LOG);
    expect(byType.ingest).toBeCloseTo(0.181, 4);
    expect(byType.chat).toBeCloseTo(0.054, 4);
    expect(byType.lint).toBeCloseTo(0.027, 4);
  });

  it('groups by day correctly', () => {
    const { byDay } = parseCostLog(LOG);
    const may17 = byDay.find(d => d.date === '2026-05-17');
    const may18 = byDay.find(d => d.date === '2026-05-18');
    expect(may17?.ingest).toBeCloseTo(0.099, 4);
    expect(may17?.chat).toBeCloseTo(0.054, 4);
    expect(may18?.lint).toBeCloseTo(0.027, 4);
    expect(may18?.ingest).toBeCloseTo(0.082, 4);
  });

  it('returns total', () => {
    const { total } = parseCostLog(LOG);
    expect(total).toBeCloseTo(0.262, 3);
  });

  it('returns days sorted newest-first', () => {
    const { byDay } = parseCostLog(LOG);
    expect(byDay[0].date > byDay[1].date).toBe(true);
  });
});
