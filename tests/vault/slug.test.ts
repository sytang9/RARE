import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/vault/slug';

describe('vault.slug', () => {
  it('converts spaces to dashes and lowercases', () => {
    expect(slugify('Cosine Similarity')).toBe('cosine-similarity');
  });
  it('strips punctuation', () => {
    expect(slugify("Alice's Adventures!")).toBe('alices-adventures');
  });
  it('transliterates or strips unicode', () => {
    const result = slugify('café—résumé');
    expect(result).toMatch(/^[a-z0-9-]+$/);
    expect(result.length).toBeGreaterThan(0);
  });
});
