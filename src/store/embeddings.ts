import type { DatabaseHandle } from './db.js';
import type { SearchResult } from '../types.js';
import { getNode } from './nodes.js';

/**
 * Insert or replace the 384-dim embedding for `nodeId`. sqlite-vec requires
 * BigInt rowids via better-sqlite3; the vector is packed as a raw Buffer
 * over the Float32Array's backing ArrayBuffer.
 */
export function upsertEmbedding(
  db: DatabaseHandle,
  nodeId: string,
  vector: Float32Array
): void {
  const node = getNode(db, nodeId);
  if (!node) return;
  db.prepare('DELETE FROM nodes_vec WHERE rowid = ?').run(BigInt(node.rowid));
  db.prepare('INSERT INTO nodes_vec(rowid, embedding) VALUES (?, ?)').run(
    BigInt(node.rowid),
    Buffer.from(vector.buffer)
  );
}

/**
 * kNN search over the embedding table. Returns a SearchResult per hit with
 * a score of `1 - distance` (cosine-like, higher is better) and a short
 * excerpt from the node's content.
 */
export function searchVector(
  db: DatabaseHandle,
  vector: Float32Array,
  limit = 20
): SearchResult[] {
  return db
    .prepare(
      `SELECT v.rowid, v.distance, n.id, n.title, n.content
       FROM nodes_vec v
       JOIN nodes n ON n.rowid = v.rowid
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`
    )
    .all(Buffer.from(vector.buffer), limit)
    .map((r) => {
      const row = r as {
        rowid: number;
        distance: number;
        id: string;
        title: string;
        content: string | null;
      };
      return {
        nodeId: row.id,
        title: row.title,
        score: 1 - row.distance,
        excerpt: firstParagraph(row.content ?? '', 200),
      };
    });
}

/**
 * Remove the embedding row for `nodeId` if one exists.
 */
export function deleteEmbedding(db: DatabaseHandle, nodeId: string): void {
  const node = getNode(db, nodeId);
  if (!node) return;
  db.prepare('DELETE FROM nodes_vec WHERE rowid = ?').run(BigInt(node.rowid));
}

/**
 * Extract the first non-heading, non-empty paragraph, trimmed to `maxLen`.
 * Private helper — kept here because searchVector is its only caller.
 */
function firstParagraph(content: string, maxLen: number): string {
  const para = content.split(/\n\n+/).find((p) => p.trim().length > 0 && !p.startsWith('#'));
  if (!para) return '';
  const trimmed = para.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '...' : trimmed;
}
