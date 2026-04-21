import type { DatabaseHandle } from './db.js';
import type { SearchResult } from '../types.js';

interface FtsRow {
  id: string;
  title: string;
  rank: number;
  excerpt: string | null;
}

/**
 * FTS5 search across node titles + content. Returns results ordered by rank
 * (lower rank = better match; we negate so SearchResult.score is
 * higher-is-better, matching the semantic search convention).
 */
export function searchFullText(
  db: DatabaseHandle,
  query: string,
  limit = 20,
): SearchResult[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.title, rank,
        snippet(nodes_fts, 1, '>>>', '<<<', '...', 40) as excerpt
       FROM nodes_fts f
       JOIN nodes n ON n.rowid = f.rowid
       WHERE nodes_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(query, limit) as FtsRow[];

  return rows.map((row) => ({
    nodeId: row.id,
    title: row.title,
    score: -row.rank,
    excerpt: row.excerpt ?? '',
  }));
}
