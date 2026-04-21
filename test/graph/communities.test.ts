import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { insertEdge } from '../../src/store/edges.js';
import { KnowledgeGraph } from '../../src/graph/builder.js';
import { detectCommunities } from '../../src/graph/communities.js';

describe('graph/communities', () => {
  let db: DatabaseHandle;
  let kg: KnowledgeGraph;

  beforeEach(() => {
    db = openDb(':memory:');
    // Two tight clusters bridged by a single edge. Louvain should find >= 2 groups.
    const nodes: Array<[string, string, string[]]> = [
      ['a1.md', 'A1', ['group-a']],
      ['a2.md', 'A2', ['group-a']],
      ['a3.md', 'A3', ['group-a']],
      ['b1.md', 'B1', ['group-b']],
      ['b2.md', 'B2', ['group-b']],
      ['b3.md', 'B3', ['group-b']],
    ];
    for (const [id, title, tags] of nodes) {
      upsertNode(db, { id, title, content: '', frontmatter: { tags } });
    }
    // Dense intra-cluster.
    insertEdge(db, { sourceId: 'a1.md', targetId: 'a2.md', context: '' });
    insertEdge(db, { sourceId: 'a2.md', targetId: 'a3.md', context: '' });
    insertEdge(db, { sourceId: 'a3.md', targetId: 'a1.md', context: '' });
    insertEdge(db, { sourceId: 'b1.md', targetId: 'b2.md', context: '' });
    insertEdge(db, { sourceId: 'b2.md', targetId: 'b3.md', context: '' });
    insertEdge(db, { sourceId: 'b3.md', targetId: 'b1.md', context: '' });
    // Single bridge edge.
    insertEdge(db, { sourceId: 'a1.md', targetId: 'b1.md', context: '' });
    kg = KnowledgeGraph.fromStore(db);
  });

  afterEach(() => db.close());

  it('detectCommunities partitions nodes into groups', () => {
    const communities = detectCommunities(kg.toUndirected(), 1.0);
    expect(communities.length).toBeGreaterThan(0);
    // Every node should appear in exactly one community.
    const seen = new Set<string>();
    for (const c of communities) {
      for (const id of c.nodeIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(6);
  });

  it('each community has label, summary, and a non-empty nodeIds list', () => {
    const communities = detectCommunities(kg.toUndirected(), 1.0);
    for (const c of communities) {
      expect(typeof c.id).toBe('number');
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.summary).toBe('string');
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.nodeIds.length).toBeGreaterThan(0);
    }
  });

  it('summary includes tags from frontmatter.tags tally', () => {
    const communities = detectCommunities(kg.toUndirected(), 1.0);
    const joined = communities.map((c) => c.summary).join(' ');
    // Tags from fixtures should appear somewhere in the summaries.
    expect(joined.toLowerCase()).toMatch(/group-a|group-b/);
  });
});
