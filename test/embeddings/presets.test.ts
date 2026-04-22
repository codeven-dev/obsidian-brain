import { describe, it, expect } from 'vitest';
import { EMBEDDING_PRESETS, resolveEmbeddingModel } from '../../src/embeddings/presets.js';

describe('resolveEmbeddingModel', () => {
  it('defaults to english preset (bge-small-en-v1.5) with empty env', () => {
    expect(resolveEmbeddingModel({})).toBe('Xenova/bge-small-en-v1.5');
  });
  it('resolves fastest preset', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_PRESET: 'fastest' })).toBe('Xenova/paraphrase-MiniLM-L3-v2');
  });
  it('resolves balanced preset', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_PRESET: 'balanced' })).toBe('Xenova/all-MiniLM-L6-v2');
  });
  it('resolves multilingual preset', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_PRESET: 'multilingual' })).toBe('Xenova/multilingual-e5-small');
  });
  it('is case-insensitive on preset name', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_PRESET: 'MULTILINGUAL' })).toBe('Xenova/multilingual-e5-small');
  });
  it('trims whitespace on preset name', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_PRESET: '  english  ' })).toBe('Xenova/bge-small-en-v1.5');
  });
  it('EMBEDDING_MODEL overrides EMBEDDING_PRESET', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_MODEL: 'custom/model', EMBEDDING_PRESET: 'fastest' })).toBe('custom/model');
  });
  it('EMBEDDING_MODEL accepts any custom model id (power-user path)', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_MODEL: 'BAAI/bge-large-en-v1.5' })).toBe('BAAI/bge-large-en-v1.5');
  });
  it('throws with clear message on unknown preset', () => {
    expect(() => resolveEmbeddingModel({ EMBEDDING_PRESET: 'englisch' }))
      .toThrow(/Unknown EMBEDDING_PRESET='englisch'.*Valid presets: english, fastest, balanced, multilingual/);
  });
  it('empty EMBEDDING_MODEL falls through to preset (not picked up as empty string override)', () => {
    expect(resolveEmbeddingModel({ EMBEDDING_MODEL: '', EMBEDDING_PRESET: 'fastest' })).toBe('Xenova/paraphrase-MiniLM-L3-v2');
  });
});

describe('EMBEDDING_PRESETS budget', () => {
  it('every default-tier preset (non-multilingual) is <= 60 MB', () => {
    const defaultTier = (['english', 'fastest', 'balanced'] as const);
    for (const name of defaultTier) {
      expect(EMBEDDING_PRESETS[name].sizeMb).toBeLessThanOrEqual(60);
    }
  });
  it('multilingual preset is allowed over budget (escape hatch)', () => {
    expect(EMBEDDING_PRESETS.multilingual.sizeMb).toBeGreaterThan(60);
  });
});
