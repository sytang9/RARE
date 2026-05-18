import { describe, it, expect } from 'vitest';
import { shouldRunLint } from '../../src/lint/scheduler';

describe('lint.scheduler.shouldRunLint', () => {
  it('returns true if lastRun is older than intervalHours', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const lastRun = new Date('2026-05-15T11:00:00Z');
    expect(shouldRunLint(lastRun, 24, now)).toBe(true);
  });
  it('returns false if lastRun is within intervalHours', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const lastRun = new Date('2026-05-16T01:00:00Z');
    expect(shouldRunLint(lastRun, 24, now)).toBe(false);
  });
  it('returns true if lastRun is null', () => {
    expect(shouldRunLint(null, 24, new Date())).toBe(true);
  });
});
