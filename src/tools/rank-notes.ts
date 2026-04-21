import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { KnowledgeGraph } from '../graph/builder.js';
import { pageRank, betweennessCentralityTop } from '../graph/centrality.js';
import { getCommunity } from '../store/communities.js';
import type { GraphInstance } from '../graph/graphology-compat.js';
import { Graph } from '../graph/graphology-compat.js';

interface RankedEntry {
  id: string;
  title: string;
  score: number;
}

function filterToCommunity(g: GraphInstance, nodeIds: Set<string>): GraphInstance {
  const out = new Graph({ multi: false, type: 'undirected' });
  g.forEachNode((id, attrs) => {
    if (nodeIds.has(id)) out.addNode(id, attrs);
  });
  g.forEachEdge((_e, _a, source, target) => {
    if (nodeIds.has(source) && nodeIds.has(target) && !out.hasEdge(source, target)) {
      out.addEdge(source, target);
    }
  });
  return out;
}

export function registerRankNotesTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'rank_notes',
    "Rank notes by importance: 'influence' (densely-connected hubs), 'bridging' (notes that connect otherwise-separate topic clusters), or both.",
    {
      metric: z.enum(['influence', 'bridging', 'both']).optional(),
      limit: z.number().int().positive().optional(),
      themeId: z.string().optional(),
    },
    async (args) => {
      const { metric, limit, themeId } = args;
      const kg = KnowledgeGraph.fromStore(ctx.db);
      let g = kg.toUndirected();

      if (themeId !== undefined) {
        const community = getCommunity(ctx.db, themeId);
        if (!community) {
          throw new Error(`No theme found matching "${themeId}"`);
        }
        g = filterToCommunity(g, new Set(community.nodeIds));
      }

      const metric_ = metric ?? 'both';
      const lim = limit ?? 20;

      const influence = (): RankedEntry[] => {
        const pr = pageRank(g);
        return Object.entries(pr)
          .sort((a, b) => b[1] - a[1])
          .slice(0, lim)
          .map(([id, score]) => ({
            id,
            title: g.hasNode(id) ? (g.getNodeAttribute(id, 'title') as string) : id,
            score,
          }));
      };

      const bridging = (): RankedEntry[] => betweennessCentralityTop(g, lim);

      if (metric_ === 'influence') return influence();
      if (metric_ === 'bridging') return bridging();
      return { influence: influence(), bridging: bridging() };
    },
  );
}
