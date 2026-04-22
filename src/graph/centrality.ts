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

/**
 * Top-`limit` nodes by betweenness centrality, with raw scores normalized by
 * the max possible number of shortest paths in an undirected graph —
 * `n * (n - 1) / 2`. Raw betweenness scales with graph size, so unnormalized
 * scores from different vaults aren't comparable; this division yields a
 * value in [0, 1] that means the same thing regardless of `n`.
 *
 * Empty / singleton graphs return an empty list rather than dividing by zero.
 */
export function betweennessCentralityNormalized(
  graph: GraphInstance,
  limit: number,
): Array<{ id: string; title: string; score: number }> {
  const n = graph.order;
  if (n < 2) return [];
  const maxPaths = (n * (n - 1)) / 2;
  const bc = betweennessFn(graph);
  return Object.entries(bc)
    .map(([id, score]) => ({ id, score: score / maxPaths }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, score }) => ({
      id,
      title: graph.hasNode(id) ? (graph.getNodeAttribute(id, 'title') as string) : id,
      // Clamp into [0, 1] — floating-point slop can push scores a hair above 1
      // on very small graphs where the single-pair denominator dominates.
      score: Math.max(0, Math.min(1, score)),
    }));
}

// Alias matching the spec name in the task description.
export { betweennessCentralityTop as betweennessCentrality };
