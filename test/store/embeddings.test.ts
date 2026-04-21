import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode, deleteNode } from '../../src/store/nodes.js';
import {
  upsertEmbedding,
  searchVector,
  deleteEmbedding,
} from '../../src/store/embeddings.js';

function randomEmbedding(seed = 0): Float32Array {
  const v = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    // Deterministic pseudo-random floats in [-1, 1]
    v[i] = Math.sin(i * 0.17 + seed) * 0.9;
  }
  // Normalise so cosine distance is well defined.
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

describe('store/embeddings', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    db = openDb(':memory:');
    upsertNode(db, { id: 'a.md', title: 'Alpha', content: 'alpha body', frontmatter: {} });
    upsertNode(db, { id: 'b.md', title: 'Beta', content: 'beta body', frontmatter: {} });
  });

  afterEach(() => {
    db.close();
  });

  it('upserts and searches embeddings', () => {
    const vA = randomEmbedding(0);
    const vB = randomEmbedding(1);
    upsertEmbedding(db, 'a.md', vA);
    upsertEmbedding(db, 'b.md', vB);

    const results = searchVector(db, vA, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe('a.md');
    // Score is 1 - distance; exact self-match should be near 1.
    expect(results[0].score).toBeGreaterThan(0.99);
  });

  it('upsertEmbedding is idempotent (replace existing row)', () => {
    const v1 = randomEmbedding(0);
    const v2 = randomEmbedding(5);
    upsertEmbedding(db, 'a.md', v1);
    upsertEmbedding(db, 'a.md', v2);
    // After re-upsert, searching with v2 should find 'a.md' as top hit.
    const results = searchVector(db, v2, 5);
    expect(results[0].nodeId).toBe('a.md');
    expect(results[0].score).toBeGreaterThan(0.99);
  });

  it('upsertEmbedding silently no-ops for missing node', () => {
    // Does not throw.
    upsertEmbedding(db, 'nonexistent.md', randomEmbedding(3));
  });

  it('deleteEmbedding removes the vector row', () => {
    const v = randomEmbedding(0);
    upsertEmbedding(db, 'a.md', v);
    deleteEmbedding(db, 'a.md');
    const results = searchVector(db, v, 5);
    expect(results.find((r) => r.nodeId === 'a.md')).toBeUndefined();
  });

  it('deleteNode cascades to embedding', () => {
    const v = randomEmbedding(0);
    upsertEmbedding(db, 'a.md', v);
    deleteNode(db, 'a.md');
    const results = searchVector(db, v, 5);
    expect(results.find((r) => r.nodeId === 'a.md')).toBeUndefined();
  });
});
