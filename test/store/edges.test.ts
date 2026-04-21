import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import {
  insertEdge,
  getEdgesBySource,
  getEdgesByTarget,
  countEdgesBySource,
  countEdgesByTarget,
  getEdgeSummariesBySource,
  getEdgeSummariesByTarget,
  deleteEdgesBySource,
  deleteEdgesByTarget,
} from '../../src/store/edges.js';

describe('store/edges', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    db = openDb(':memory:');
    upsertNode(db, { id: 'a.md', title: 'Alpha', content: '', frontmatter: {} });
    upsertNode(db, { id: 'b.md', title: 'Beta', content: '', frontmatter: {} });
    upsertNode(db, { id: 'c.md', title: 'Gamma', content: '', frontmatter: {} });
  });

  afterEach(() => {
    db.close();
  });

  it('inserts and retrieves edges by source', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'A links to B' });
    const edges = getEdgesBySource(db, 'a.md');
    expect(edges).toHaveLength(1);
    expect(edges[0].targetId).toBe('b.md');
    expect(edges[0].context).toBe('A links to B');
  });

  it('allows multiple edges between the same pair', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'First mention' });
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'Second mention' });
    const edges = getEdgesBySource(db, 'a.md');
    expect(edges).toHaveLength(2);
  });

  it('retrieves backlinks (edges targeting a node)', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'link' });
    const backlinks = getEdgesByTarget(db, 'b.md');
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].sourceId).toBe('a.md');
  });

  it('counts edges for a node', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'link 1' });
    insertEdge(db, { sourceId: 'a.md', targetId: 'c.md', context: 'link 2' });
    insertEdge(db, { sourceId: 'b.md', targetId: 'a.md', context: 'backlink' });
    expect(countEdgesBySource(db, 'a.md')).toBe(2);
    expect(countEdgesByTarget(db, 'a.md')).toBe(1);
  });

  it('gets edge summaries (target titles without context)', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'long paragraph...' });
    insertEdge(db, { sourceId: 'c.md', targetId: 'a.md', context: 'another paragraph...' });
    const outSummary = getEdgeSummariesBySource(db, 'a.md');
    expect(outSummary).toHaveLength(1);
    expect(outSummary[0].title).toBe('Beta');
    const inSummary = getEdgeSummariesByTarget(db, 'a.md');
    expect(inSummary).toHaveLength(1);
    expect(inSummary[0].title).toBe('Gamma');
  });

  it('summary distinct-dedupes multiple edges between the same pair', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'first' });
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'second' });
    const outSummary = getEdgeSummariesBySource(db, 'a.md');
    expect(outSummary).toHaveLength(1);
  });

  it('summary falls back to target id when neighbour has no node row', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'dangling.md', context: 'x' });
    const outSummary = getEdgeSummariesBySource(db, 'a.md');
    expect(outSummary[0].title).toBe('dangling.md');
  });

  it('deleteEdgesBySource removes outgoing edges only', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'out' });
    insertEdge(db, { sourceId: 'c.md', targetId: 'a.md', context: 'in' });
    deleteEdgesBySource(db, 'a.md');
    expect(getEdgesBySource(db, 'a.md')).toHaveLength(0);
    expect(getEdgesByTarget(db, 'a.md')).toHaveLength(1);
  });

  it('deleteEdgesByTarget removes incoming edges only', () => {
    insertEdge(db, { sourceId: 'a.md', targetId: 'b.md', context: 'out' });
    insertEdge(db, { sourceId: 'c.md', targetId: 'a.md', context: 'in' });
    deleteEdgesByTarget(db, 'a.md');
    expect(getEdgesByTarget(db, 'a.md')).toHaveLength(0);
    expect(getEdgesBySource(db, 'a.md')).toHaveLength(1);
  });
});
