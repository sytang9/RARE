import { describe, it, expect } from 'vitest';
import cases from './cases.json';
import { answer } from '../src/chat/answer';
import { initAnthropic } from '../src/llm/anthropic';
import type { VaultRoot } from '../src/vault/root';

const RUN = process.env.RARE_EVAL === '1';
const VAULT = process.env.RARE_EVAL_VAULT;
const KEY = process.env.ANTHROPIC_API_KEY;

interface Case {
  question: string;
  expected_pages: string[];
  min_citations: number;
}

describe.skipIf(!RUN)('retrieval eval', () => {
  it(
    'runs all cases and reports pass rate',
    async () => {
      if (!KEY || !VAULT) {
        throw new Error('Set ANTHROPIC_API_KEY and RARE_EVAL_VAULT');
      }
      initAnthropic(KEY);
      let passed = 0;
      const failures: Array<{ q: string; reason: string }> = [];
      for (const c of cases as Case[]) {
        const vault: VaultRoot = { root: VAULT };
        const result = await answer(c.question, [], vault);
        const missing = c.expected_pages.filter(p => !result.citations.includes(p));
        if (missing.length === 0 && result.citations.length >= c.min_citations) {
          passed++;
        } else {
          failures.push({
            q: c.question,
            reason: `missing=${missing.join(',')} cites=${result.citations.length}`,
          });
        }
      }
      console.log(`Eval: ${passed}/${cases.length} passed`);
      for (const f of failures) {
        console.log('FAIL:', f.q, '—', f.reason);
      }
      expect(passed / cases.length).toBeGreaterThanOrEqual(0.7);
    },
    300_000
  );
});
