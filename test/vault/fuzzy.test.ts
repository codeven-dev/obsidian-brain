import { describe, it, expect } from 'vitest';
import { fuzzyFind, similarity } from '../../src/vault/fuzzy.js';

describe('similarity', () => {
  it('returns 1 for identical strings (case insensitive)', () => {
    expect(similarity('Hello World', 'hello world')).toBe(1);
  });

  it('returns <1 for a single-character edit', () => {
    const s = similarity('hello', 'hallo');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('is symmetric', () => {
    expect(similarity('foo bar', 'foo baz')).toBeCloseTo(
      similarity('foo baz', 'foo bar'),
      10,
    );
  });
});

describe('fuzzyFind - exact substring stage', () => {
  it('finds a direct case-insensitive substring match', () => {
    const hay = 'The quick brown fox jumps over the lazy dog.';
    const hits = fuzzyFind(hay, 'Quick Brown', 0.7);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBe(1);
    expect(hits[0].text.toLowerCase()).toBe('quick brown');
    // start/end brackets the matched substring.
    expect(hay.slice(hits[0].start, hits[0].end).toLowerCase()).toBe(
      'quick brown',
    );
  });

  it('reports every occurrence of an exact match', () => {
    const hay = 'foo foo foo';
    const hits = fuzzyFind(hay, 'foo', 0.7);
    expect(hits.length).toBe(3);
    for (const h of hits) expect(h.score).toBe(1);
  });

  it('returns empty when needle is empty', () => {
    expect(fuzzyFind('anything', '', 0.7)).toEqual([]);
  });
});

describe('fuzzyFind - sliding window Levenshtein stage', () => {
  it('finds a near-match with a single typo above threshold', () => {
    const hay = 'The quick brown fox jumps over the lazy dog.';
    // "quikc" has a swap typo vs "quick"
    const hits = fuzzyFind(hay, 'quikc brown', 0.7);
    expect(hits.length).toBeGreaterThan(0);
    // Not exact, but score should be well above threshold.
    expect(hits[0].score).toBeGreaterThanOrEqual(0.7);
    expect(hits[0].score).toBeLessThan(1);
  });

  it('threshold cutoff: wildly different needle returns nothing', () => {
    const hay = 'The quick brown fox jumps over the lazy dog.';
    const hits = fuzzyFind(hay, 'zzzzzz qqqqqq', 0.9);
    expect(hits).toEqual([]);
  });

  it('threshold=0 is permissive (returns at least one fuzzy hit)', () => {
    const hay = 'Alpha beta gamma delta.';
    const hits = fuzzyFind(hay, 'zzz', 0);
    // Some per-line best match will always surface with threshold 0.
    expect(hits.length).toBeGreaterThan(0);
  });
});
