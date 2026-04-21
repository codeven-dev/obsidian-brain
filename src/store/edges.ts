import type { DatabaseHandle } from './db.js';
import type { ParsedEdge } from '../types.js';

type EdgeRow = { id: number; source_id: string; target_id: string; context: string };

/**
 * Append an edge. Edges are never de-duplicated by (source, target, context);
 * the graph layer handles any collapsing.
 */
export function insertEdge(db: DatabaseHandle, edge: ParsedEdge): void {
  db.prepare(
    'INSERT INTO edges (source_id, target_id, context) VALUES (?, ?, ?)'
  ).run(edge.sourceId, edge.targetId, edge.context);
}

/**
 * All edges leaving `nodeId`.
 */
export function getEdgesBySource(
  db: DatabaseHandle,
  nodeId: string
): Array<ParsedEdge & { id: number }> {
  return db
    .prepare('SELECT id, source_id, target_id, context FROM edges WHERE source_id = ?')
    .all(nodeId)
    .map((r) => {
      const row = r as EdgeRow;
      return {
        id: row.id,
        sourceId: row.source_id,
        targetId: row.target_id,
        context: row.context,
      };
    });
}

/**
 * All edges arriving at `nodeId`.
 */
export function getEdgesByTarget(
  db: DatabaseHandle,
  nodeId: string
): Array<ParsedEdge & { id: number }> {
  return db
    .prepare('SELECT id, source_id, target_id, context FROM edges WHERE target_id = ?')
    .all(nodeId)
    .map((r) => {
      const row = r as EdgeRow;
      return {
        id: row.id,
        sourceId: row.source_id,
        targetId: row.target_id,
        context: row.context,
      };
    });
}

/**
 * Count of edges leaving `nodeId`.
 */
export function countEdgesBySource(db: DatabaseHandle, nodeId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM edges WHERE source_id = ?')
    .get(nodeId) as { cnt: number };
  return row.cnt;
}

/**
 * Count of edges arriving at `nodeId`.
 */
export function countEdgesByTarget(db: DatabaseHandle, nodeId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM edges WHERE target_id = ?')
    .get(nodeId) as { cnt: number };
  return row.cnt;
}

/**
 * Distinct outgoing-neighbour summaries. Title falls back to the target id
 * when the neighbour is a dangling link (no node row exists for it yet).
 */
export function getEdgeSummariesBySource(
  db: DatabaseHandle,
  nodeId: string
): Array<{ nodeId: string; title: string }> {
  return db
    .prepare(
      `SELECT DISTINCT e.target_id, n.title
       FROM edges e
       LEFT JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ?`
    )
    .all(nodeId)
    .map((r) => {
      const row = r as { target_id: string; title: string | null };
      return { nodeId: row.target_id, title: row.title ?? row.target_id };
    });
}

/**
 * Distinct incoming-neighbour summaries (back-links).
 */
export function getEdgeSummariesByTarget(
  db: DatabaseHandle,
  nodeId: string
): Array<{ nodeId: string; title: string }> {
  return db
    .prepare(
      `SELECT DISTINCT e.source_id, n.title
       FROM edges e
       LEFT JOIN nodes n ON n.id = e.source_id
       WHERE e.target_id = ?`
    )
    .all(nodeId)
    .map((r) => {
      const row = r as { source_id: string; title: string | null };
      return { nodeId: row.source_id, title: row.title ?? row.source_id };
    });
}

/**
 * Delete every edge leaving `nodeId`. Used when re-indexing a file — the
 * pipeline wipes old outgoing edges and re-emits from the parsed note.
 */
export function deleteEdgesBySource(db: DatabaseHandle, nodeId: string): void {
  db.prepare('DELETE FROM edges WHERE source_id = ?').run(nodeId);
}

/**
 * Delete every edge arriving at `nodeId`. Used when a node itself is removed.
 */
export function deleteEdgesByTarget(db: DatabaseHandle, nodeId: string): void {
  db.prepare('DELETE FROM edges WHERE target_id = ?').run(nodeId);
}
