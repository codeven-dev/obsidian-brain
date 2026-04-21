import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { getNode } from '../../src/store/nodes.js';
import { getEdgesBySource } from '../../src/store/edges.js';
import { getAllCommunities } from '../../src/store/communities.js';
import { Embedder } from '../../src/embeddings/embedder.js';
import { IndexPipeline } from '../../src/pipeline/indexer.js';

const FIXTURE_VAULT = join(import.meta.dirname, '..', 'fixtures', 'vault');

describe.sequential('IndexPipeline', () => {
  let db: DatabaseHandle;
  let embedder: Embedder;
  let pipeline: IndexPipeline;

  beforeAll(async () => {
    db = openDb(':memory:');
    embedder = new Embedder();
    await embedder.init();
    pipeline = new IndexPipeline(db, embedder);
  }, 120_000);

  afterAll(async () => {
    db.close();
    await embedder.dispose();
  });

  it('indexes the fixture vault', async () => {
    const stats = await pipeline.index(FIXTURE_VAULT);
    expect(stats.nodesIndexed).toBeGreaterThan(0);
    expect(stats.edgesIndexed).toBeGreaterThan(0);

    const alice = getNode(db, 'People/Alice Smith.md');
    expect(alice).toBeDefined();
    expect(alice!.title).toBe('Alice Smith');

    const edges = getEdgesBySource(db, 'People/Alice Smith.md');
    expect(edges.length).toBeGreaterThan(0);
  }, 120_000);

  it('creates stub nodes for broken links', async () => {
    // Store retains state from the first test's index() call
    const edges = getEdgesBySource(db, 'Ideas/Acme Project.md');
    const stubEdge = edges.find((e) => e.targetId.includes('Nonexistent'));
    expect(stubEdge).toBeDefined();
  });

  it('detects communities', async () => {
    // Communities were detected during the first test's index() call
    const communities = getAllCommunities(db);
    expect(communities.length).toBeGreaterThan(0);
  });

  it('is incremental (skips unchanged files)', async () => {
    // Use a fresh store so the first call indexes everything.
    const freshDb = openDb(':memory:');
    const freshPipeline = new IndexPipeline(freshDb, embedder);

    const first = await freshPipeline.index(FIXTURE_VAULT);
    expect(first.nodesIndexed).toBeGreaterThan(0);

    const second = await freshPipeline.index(FIXTURE_VAULT);
    expect(second.nodesIndexed).toBe(0);
    expect(second.nodesSkipped).toBe(first.nodesIndexed);

    freshDb.close();
  }, 120_000);
});
