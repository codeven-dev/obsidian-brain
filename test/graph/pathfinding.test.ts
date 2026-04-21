import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { insertEdge } from '../../src/store/edges.js';
import { KnowledgeGraph } from '../../src/graph/builder.js';
import {
  findNeighbors,
  findPaths,
  commonNeighbors,
  extractSubgraph,
} from '../../src/graph/pathfinding.js';

describe('graph/pathfinding', () => {
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

  it('finds neighbors at depth 1', () => {
    const neighbors = findNeighbors(kg.graph(), 'a.md', 1);
    const ids = neighbors.map((n) => n.id);
    expect(ids).toContain('b.md');
    expect(ids).toContain('c.md');
    expect(ids).not.toContain('d.md');
  });

  it('finds neighbors at depth 2', () => {
    const neighbors = findNeighbors(kg.graph(), 'a.md', 2);
    const ids = neighbors.map((n) => n.id);
    expect(ids).toContain('b.md');
    expect(ids).toContain('c.md');
  });

  it('returns empty for unknown seed', () => {
    expect(findNeighbors(kg.graph(), 'missing.md', 1)).toEqual([]);
  });

  it('finds paths between connected nodes', () => {
    const paths = findPaths(kg.graph(), 'a.md', 'c.md', 3);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    // Direct hop path has 1 edge.
    const directPath = paths.find((p) => p.length === 1);
    expect(directPath).toBeDefined();
    // Via-B path includes b.md.
    const viaB = paths.find((p) => p.nodes.includes('b.md'));
    expect(viaB).toBeDefined();
  });

  it('returns empty paths for disconnected nodes', () => {
    const paths = findPaths(kg.graph(), 'a.md', 'd.md', 3);
    expect(paths).toHaveLength(0);
  });

  it('returns empty paths for unknown endpoint', () => {
    expect(findPaths(kg.graph(), 'a.md', 'ghost.md', 3)).toEqual([]);
  });

  it('finds common neighbors', () => {
    const common = commonNeighbors(kg.graph(), 'a.md', 'b.md');
    expect(common.map((n) => n.id)).toContain('c.md');
  });

  it('extracts subgraph', () => {
    const sub = extractSubgraph(kg.graph(), 'a.md', 1);
    expect(sub.nodes.map((n) => n.id)).toContain('a.md');
    expect(sub.nodes.map((n) => n.id)).toContain('b.md');
    expect(sub.nodes.map((n) => n.id)).toContain('c.md');
    expect(sub.nodes.map((n) => n.id)).not.toContain('d.md');
    expect(sub.edges.length).toBeGreaterThan(0);
  });

  it('subgraph of unknown seed returns empty', () => {
    const sub = extractSubgraph(kg.graph(), 'ghost.md', 1);
    expect(sub.nodes).toEqual([]);
    expect(sub.edges).toEqual([]);
  });
});
