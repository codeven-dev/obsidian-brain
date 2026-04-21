import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { insertEdge } from '../../src/store/edges.js';
import { KnowledgeGraph } from '../../src/graph/builder.js';
import {
  pageRank,
  betweennessCentralityTop,
} from '../../src/graph/centrality.js';

describe('graph/centrality', () => {
  let db: DatabaseHandle;
  let kg: KnowledgeGraph;

  beforeEach(() => {
    db = openDb(':memory:');
    for (const [id, title] of [
      ['a.md', 'A'],
      ['b.md', 'B'],
      ['c.md', 'C'],
      ['d.md', 'D'],
    ]) {
      upsertNode(db, { id, title, content: '', frontmatter: {} });
    }
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'A links to B' });
    insertEdge(db, { sourceId: 'b.md', targetId: 'c.md', context: 'B links to C' });
    insertEdge(db, { sourceId: 'a.md', targetId: 'c.md', context: 'A links to C' });
    kg = KnowledgeGraph.fromStore(db);
  });

  afterEach(() => db.close());

  it('PageRank returns a score for every node', () => {
    const scores = pageRank(kg.toUndirected());
    expect(Object.keys(scores).length).toBe(4);
    // Every connected node should have a finite score > 0.
    expect(scores['a.md']).toBeGreaterThan(0);
    expect(scores['b.md']).toBeGreaterThan(0);
    expect(scores['c.md']).toBeGreaterThan(0);
    // Isolated node D is filtered out of the connected subgraph and scored 0.
    expect(scores['d.md']).toBe(0);
  });

  it('PageRank tolerates isolated nodes (no NaN / Infinity)', () => {
    const scores = pageRank(kg.toUndirected());
    for (const v of Object.values(scores)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('PageRank on empty-ish graphs: all-isolated -> all zero', () => {
    // Fresh graph with no edges.
    const freshDb = openDb(':memory:');
    upsertNode(freshDb, { id: 'x.md', title: 'X', content: '', frontmatter: {} });
    upsertNode(freshDb, { id: 'y.md', title: 'Y', content: '', frontmatter: {} });
    const freshKg = KnowledgeGraph.fromStore(freshDb);
    const scores = pageRank(freshKg.toUndirected());
    expect(scores['x.md']).toBe(0);
    expect(scores['y.md']).toBe(0);
    freshDb.close();
  });

  it('betweennessCentralityTop returns top-N nodes', () => {
    const bridges = betweennessCentralityTop(kg.toUndirected(), 10);
    expect(bridges.length).toBeGreaterThan(0);
    // Each result has id/title/score
    for (const b of bridges) {
      expect(typeof b.id).toBe('string');
      expect(typeof b.title).toBe('string');
      expect(typeof b.score).toBe('number');
    }
  });

  it('betweennessCentralityTop respects limit', () => {
    const bridges = betweennessCentralityTop(kg.toUndirected(), 2);
    expect(bridges.length).toBeLessThanOrEqual(2);
  });
});
