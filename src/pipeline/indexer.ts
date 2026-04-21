import { stat } from 'fs/promises';
import { join } from 'path';
import { parseVault } from '../vault/parser.js';
import type { DatabaseHandle } from '../store/db.js';
import { upsertNode, getNode, deleteNode } from '../store/nodes.js';
import { insertEdge, deleteEdgesBySource } from '../store/edges.js';
import { upsertEmbedding } from '../store/embeddings.js';
import {
  getAllSyncPaths,
  getSyncMtime,
  setSyncMtime,
} from '../store/sync.js';
import { Embedder } from '../embeddings/embedder.js';
import { KnowledgeGraph } from '../graph/builder.js';
import { detectCommunities } from '../graph/communities.js';
import { clearCommunities, upsertCommunity } from '../store/communities.js';

export interface IndexStats {
  nodesIndexed: number;
  nodesSkipped: number;
  edgesIndexed: number;
  communitiesDetected: number;
  stubNodesCreated: number;
}

export class IndexPipeline {
  constructor(
    private db: DatabaseHandle,
    private embedder: Embedder,
  ) {}

  async index(vaultPath: string, resolution = 1.0): Promise<IndexStats> {
    const stats: IndexStats = {
      nodesIndexed: 0,
      nodesSkipped: 0,
      edgesIndexed: 0,
      communitiesDetected: 0,
      stubNodesCreated: 0,
    };

    const { nodes, edges, stubIds } = await parseVault(vaultPath);
    const previousPaths = new Set(getAllSyncPaths(this.db));

    // Detect deleted files
    const currentPaths = new Set(nodes.map(n => n.id));
    for (const oldPath of previousPaths) {
      if (!currentPaths.has(oldPath)) {
        deleteNode(this.db, oldPath);
      }
    }

    // Index nodes (incremental)
    for (const node of nodes) {
      const fileStat = await stat(join(vaultPath, node.id));
      const mtime = fileStat.mtimeMs;
      const prevMtime = getSyncMtime(this.db, node.id);

      if (prevMtime !== undefined && prevMtime >= mtime) {
        stats.nodesSkipped++;
        continue;
      }

      upsertNode(this.db, node);

      // Compute and store embedding
      const tags = Array.isArray(node.frontmatter.tags) ? node.frontmatter.tags : [];
      const text = Embedder.buildEmbeddingText(node.title, tags as string[], node.content);
      const embedding = await this.embedder.embed(text);
      upsertEmbedding(this.db, node.id, embedding);

      // Re-index edges from this node
      deleteEdgesBySource(this.db, node.id);
      for (const edge of edges.filter(e => e.sourceId === node.id)) {
        insertEdge(this.db, edge);
        stats.edgesIndexed++;
      }

      setSyncMtime(this.db, node.id, mtime);
      stats.nodesIndexed++;
    }

    // Create stub nodes
    for (const stubId of stubIds) {
      if (!getNode(this.db, stubId)) {
        upsertNode(this.db, {
          id: stubId,
          title: stubId.replace('_stub/', '').replace('.md', ''),
          content: '',
          frontmatter: { _stub: true },
        });
        stats.stubNodesCreated++;
      }
    }

    // If any nodes were indexed, re-run community detection
    if (stats.nodesIndexed > 0 || stats.stubNodesCreated > 0) {
      const kg = KnowledgeGraph.fromStore(this.db);
      const communities = detectCommunities(kg.toUndirected(), resolution);
      clearCommunities(this.db);
      for (const c of communities) {
        upsertCommunity(this.db, c);
      }
      stats.communitiesDetected = communities.length;
    }

    return stats;
  }
}

