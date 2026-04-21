import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export type { Database };

/**
 * Database handle type — alias for better-sqlite3's Database instance.
 * All store functions take one of these as their first argument.
 */
export type DatabaseHandle = Database.Database;

/**
 * Open a SQLite database at `dbPath`, enable WAL mode, load the sqlite-vec
 * extension, and initialize the schema. Returns the live handle.
 */
export function openDb(dbPath: string): DatabaseHandle {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  sqliteVec.load(db);
  initSchema(db);
  return db;
}

/**
 * Create all tables, indexes, and virtual tables (FTS5 + vec0) used by the
 * knowledge graph store. Idempotent — safe to call on an existing database.
 */
export function initSchema(db: DatabaseHandle): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      frontmatter TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);

    CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      node_ids TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS sync (
      path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts
      USING fts5(title, content, content='nodes', content_rowid='rowid');

    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_vec
      USING vec0(embedding float[384]);
  `);
}
