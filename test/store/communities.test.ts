import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode, deleteNode } from '../../src/store/nodes.js';
import {
  upsertCommunity,
  getAllCommunities,
  pruneNodeFromCommunities,
} from '../../src/store/communities.js';

/**
 * v1.4.0 regression guard for the theme-cache invalidation bug. Before this
 * fix, `delete_note` pruned the `nodeIds` array of every cached community row
 * but left the pre-computed `summary` string stale — so `detect_themes`
 * returned responses where `summary` named a note that `nodeIds` had already
 * dropped. The feedback captured a clean five-step reproduction; these tests
 * pin the write-path behaviour.
 */
describe('store/communities - summary regeneration on prune (A1)', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('regenerates summary to exclude the deleted node title after deleteNode', () => {
    upsertNode(db, {
      id: 'welcome.md',
      title: 'Welcome',
      content: '',
      frontmatter: {},
    });
    upsertNode(db, {
      id: 'victim.md',
      title: 'VictimNote',
      content: '',
      frontmatter: { tags: ['cache-test'] },
    });
    upsertCommunity(db, {
      id: 0,
      label: 'Welcome',
      summary:
        'Key members: Welcome, VictimNote. Tags: cache-test. 2 nodes total.',
      nodeIds: ['welcome.md', 'victim.md'],
    });

    deleteNode(db, 'victim.md');

    const [cluster] = getAllCommunities(db);
    // nodeIds pruned...
    expect(cluster.nodeIds).toEqual(['welcome.md']);
    // ...AND the summary no longer names the deleted note or its tag.
    expect(cluster.summary).not.toContain('VictimNote');
    expect(cluster.summary).not.toContain('cache-test');
    expect(cluster.summary).toContain('Welcome');
    expect(cluster.summary).toContain('1 nodes total');
  });

  it('pruneNodeFromCommunities rebuilds summary directly when called', () => {
    upsertNode(db, { id: 'a.md', title: 'A', content: '', frontmatter: {} });
    upsertNode(db, { id: 'b.md', title: 'B', content: '', frontmatter: {} });
    upsertNode(db, { id: 'c.md', title: 'C', content: '', frontmatter: {} });
    upsertCommunity(db, {
      id: 5,
      label: 'tri',
      summary: 'Key members: A, B, C. 3 nodes total.',
      nodeIds: ['a.md', 'b.md', 'c.md'],
    });

    pruneNodeFromCommunities(db, 'b.md');

    const [cluster] = getAllCommunities(db);
    expect(cluster.nodeIds).toEqual(['a.md', 'c.md']);
    expect(cluster.summary).not.toContain('B');
    expect(cluster.summary).toContain('A');
    expect(cluster.summary).toContain('C');
    expect(cluster.summary).toContain('2 nodes total');
  });

  it('leaves summary alone when the community did not contain the deleted id', () => {
    upsertNode(db, { id: 'x.md', title: 'X', content: '', frontmatter: {} });
    upsertNode(db, { id: 'y.md', title: 'Y', content: '', frontmatter: {} });
    const originalSummary = 'Key members: X, Y. 2 nodes total.';
    upsertCommunity(db, {
      id: 0,
      label: 'xy',
      summary: originalSummary,
      nodeIds: ['x.md', 'y.md'],
    });

    pruneNodeFromCommunities(db, 'unrelated.md');

    const [cluster] = getAllCommunities(db);
    expect(cluster.summary).toBe(originalSummary);
    expect(cluster.nodeIds).toEqual(['x.md', 'y.md']);
  });
});
