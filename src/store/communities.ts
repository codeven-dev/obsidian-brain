import type { DatabaseHandle } from './db.js';
import type { Community } from '../types.js';
import { buildSummary, type SummaryMember } from '../graph/communities.js';

interface CommunityRow {
  id: number;
  label: string;
  summary: string;
  node_ids: string;
}

export function upsertCommunity(db: DatabaseHandle, c: Community): void {
  db.prepare(
    `INSERT INTO communities (id, label, summary, node_ids) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       summary = excluded.summary,
       node_ids = excluded.node_ids`,
  ).run(c.id, c.label, c.summary, JSON.stringify(c.nodeIds));
}

export function clearCommunities(db: DatabaseHandle): void {
  db.prepare('DELETE FROM communities').run();
}

/**
 * Remove `nodeId` from every community row's `node_ids` array AND regenerate
 * the cached `summary` string from the live remaining members so the two
 * fields don't drift apart. If a row becomes empty after pruning, delete the
 * row entirely. Cheap: O(communities).
 *
 * Called from `deleteNode` so the theme / community cache doesn't accumulate
 * ghost ids across sessions when vault files are removed. Before this
 * regenerated `summary`, `detect_themes` would return responses where the
 * `nodeIds` array was freshly pruned but the human-readable `summary` still
 * named the deleted note — classic half-invalidated cache.
 */
export function pruneNodeFromCommunities(db: DatabaseHandle, nodeId: string): void {
  const rows = db
    .prepare('SELECT id, label, summary, node_ids FROM communities')
    .all() as CommunityRow[];
  const updateStmt = db.prepare(
    'UPDATE communities SET node_ids = ?, summary = ? WHERE id = ?',
  );
  const deleteStmt = db.prepare('DELETE FROM communities WHERE id = ?');
  // Reuse a single prepared lookup for every remaining member. `getNode` would
  // pull more columns than we need; a focused SELECT keeps the hot path tight.
  const lookupStmt = db.prepare(
    'SELECT title, frontmatter FROM nodes WHERE id = ?',
  );

  for (const row of rows) {
    const ids = JSON.parse(row.node_ids) as string[];
    if (!ids.includes(nodeId)) continue;
    const pruned = ids.filter((id) => id !== nodeId);
    if (pruned.length === 0) {
      deleteStmt.run(row.id);
      continue;
    }

    // Rebuild the summary from live store rows. Members missing from the
    // store (e.g. already-orphaned ids that slipped through) are skipped for
    // the title/tag tally; the trailing "N nodes total" uses `pruned.length`
    // so the count stays truthful even when some ids are stale.
    const members: SummaryMember[] = [];
    for (const id of pruned) {
      const nodeRow = lookupStmt.get(id) as
        | { title: string; frontmatter: string }
        | undefined;
      if (!nodeRow) continue;
      const fm = JSON.parse(nodeRow.frontmatter) as Record<string, unknown>;
      const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
      members.push({ title: nodeRow.title, tags });
    }

    const summary = buildSummary(members, pruned.length);
    updateStmt.run(JSON.stringify(pruned), summary, row.id);
  }
}

export function getAllCommunities(db: DatabaseHandle): Community[] {
  const rows = db
    .prepare('SELECT id, label, summary, node_ids FROM communities')
    .all() as CommunityRow[];
  return rows.map(rowToCommunity);
}

/**
 * Look up a community by numeric id (passed as string or number) or by label
 * match. Returns the first hit. Labels are matched exactly.
 */
export function getCommunity(
  db: DatabaseHandle,
  idOrLabel: string | number,
): Community | null {
  const asNumber = typeof idOrLabel === 'number' ? idOrLabel : Number(idOrLabel);
  const numericId = Number.isFinite(asNumber) ? asNumber : -1;
  const label = typeof idOrLabel === 'string' ? idOrLabel : String(idOrLabel);
  const row = db
    .prepare(
      'SELECT id, label, summary, node_ids FROM communities WHERE id = ? OR label = ? LIMIT 1',
    )
    .get(numericId, label) as CommunityRow | undefined;
  return row ? rowToCommunity(row) : null;
}

function rowToCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    label: row.label,
    summary: row.summary,
    nodeIds: JSON.parse(row.node_ids) as string[],
  };
}
