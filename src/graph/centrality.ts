import {
  Graph,
  type GraphInstance,
  pageRankFn,
  betweennessFn,
} from './graphology-compat.js';

/**
 * PageRank with an isolate-filter workaround.
 *
 * graphology-metrics' pagerank fails to converge when the graph contains
 * isolated nodes (degree === 0). We split them out, score them as 0, then
 * run PageRank on the connected subgraph and merge the results.
 *
 * Ported from the reference `safeRank` (graph.ts:12-38).
 */
export function pageRank(graph: GraphInstance): Record<string, number> {
  const scores: Record<string, number> = {};

  const connected = new Graph({ multi: false, type: 'undirected' });
  graph.forEachNode((id, attrs) => {
    if (graph.degree(id) > 0) {
      connected.addNode(id, attrs);
    } else {
      scores[id] = 0;
    }
  });
  graph.forEachEdge((_edge, _attrs, source, target) => {
    if (
      connected.hasNode(source) &&
      connected.hasNode(target) &&
      !connected.hasEdge(source, target)
    ) {
      connected.addEdge(source, target);
    }
  });

  if (connected.order === 0) return scores;

  const pr = pageRankFn(connected, { maxIterations: 1000, tolerance: 1e-6 });
  for (const [id, score] of Object.entries(pr)) {
    scores[id] = score;
  }
  return scores;
}

/**
 * Top-`limit` nodes by betweenness centrality on the input graph. Callers
 * typically pass an undirected projection.
 */
export function betweennessCentralityTop(
  graph: GraphInstance,
  limit: number,
): Array<{ id: string; title: string; score: number }> {
  const bc = betweennessFn(graph);
  return Object.entries(bc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({
      id,
      title: graph.hasNode(id) ? (graph.getNodeAttribute(id, 'title') as string) : id,
      score,
    }));
}

// Alias matching the spec name in the task description.
export { betweennessCentralityTop as betweennessCentrality };
