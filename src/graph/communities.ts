import { type GraphInstance, louvain } from './graphology-compat.js';
import type { Community } from '../types.js';
import { pageRank } from './centrality.js';

/**
 * Louvain community detection with a heuristic summary per community.
 *
 * For each detected community we:
 *  - Sort members by PageRank and take the top member as the community label.
 *  - List the titles of the top 5 members.
 *  - Tally `frontmatter.tags` across members for a short tag summary.
 *
 * Accepts any graphology graph; callers typically pass an undirected
 * projection (Louvain requires undirected / can mutate weights otherwise).
 */
export function detectCommunities(
  graph: GraphInstance,
  resolution = 1.0,
): Community[] {
  const assignments = louvain(graph, { resolution });

  const communityMap = new Map<number, string[]>();
  for (const [nodeId, communityId] of Object.entries(assignments)) {
    const existing = communityMap.get(communityId) ?? [];
    existing.push(nodeId);
    communityMap.set(communityId, existing);
  }

  const pr = pageRank(graph);
  const communities: Community[] = [];

  for (const [id, nodeIds] of communityMap) {
    const sorted = [...nodeIds].sort((a, b) => (pr[b] ?? 0) - (pr[a] ?? 0));
    const topId = sorted[0] ?? '';
    const label = graph.hasNode(topId)
      ? (graph.getNodeAttribute(topId, 'title') as string)
      : topId;
    const topTitles = sorted.slice(0, 5).map((nid) =>
      graph.hasNode(nid) ? (graph.getNodeAttribute(nid, 'title') as string) : nid,
    );

    const tagCounts = new Map<string, number>();
    for (const nid of nodeIds) {
      if (!graph.hasNode(nid)) continue;
      const fm = graph.getNodeAttribute(nid, 'frontmatter') as
        | Record<string, unknown>
        | undefined;
      const tags = Array.isArray(fm?.tags) ? (fm!.tags as string[]) : [];
      for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
    const tagStr = topTags.length > 0 ? ` Tags: ${topTags.join(', ')}.` : '';
    const summary = `Key members: ${topTitles.join(', ')}.${tagStr} ${nodeIds.length} nodes total.`;

    communities.push({ id: Number(id), label, summary, nodeIds });
  }

  return communities;
}
