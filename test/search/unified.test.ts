import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { upsertEmbedding } from '../../src/store/embeddings.js';
import { Embedder } from '../../src/embeddings/embedder.js';
import { Search } from '../../src/search/unified.js';

describe.sequential('Search', () => {
  let db: DatabaseHandle;
  let embedder: Embedder;
  let search: Search;

  beforeAll(async () => {
    db = openDb(':memory:');
    embedder = new Embedder();
    await embedder.init();
    search = new Search(db, embedder);

    const nodes = [
      {
        id: 'graph.md',
        title: 'Graph Theory',
        content:
          'Study of mathematical structures used to model pairwise relations',
        frontmatter: {},
      },
      {
        id: 'cake.md',
        title: 'Chocolate Cake',
        content: 'A delicious dessert made with cocoa powder and sugar',
        frontmatter: {},
      },
      {
        id: 'network.md',
        title: 'Network Analysis',
        content: 'Analysis of graph structures in social networks',
        frontmatter: {},
      },
    ];

    for (const node of nodes) {
      upsertNode(db, node);
      const text = Embedder.buildEmbeddingText(node.title, [], node.content);
      const embedding = await embedder.embed(text);
      upsertEmbedding(db, node.id, embedding);
    }
  }, 120_000);

  afterAll(async () => {
    db.close();
    await embedder.dispose();
  });

  it('semantic search returns relevant results', async () => {
    const results = await search.semantic('graph structures and relationships');
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.nodeId);
    const graphIdx = ids.indexOf('graph.md');
    const cakeIdx = ids.indexOf('cake.md');
    expect(graphIdx).toBeLessThan(cakeIdx);
  }, 60_000);

  it('fulltext search returns exact keyword matches', () => {
    const results = search.fulltext('cocoa powder');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe('cake.md');
  });

  it('fulltext search returns empty for unmatched query', () => {
    expect(search.fulltext('xyzzy_no_such_word')).toEqual([]);
  });
});
