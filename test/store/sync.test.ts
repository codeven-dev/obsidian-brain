import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import {
  getSyncMtime,
  setSyncMtime,
  getAllSyncPaths,
  deleteSyncPath,
} from '../../src/store/sync.js';

describe('store/sync', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('tracks sync state (insert + update)', () => {
    setSyncMtime(db, 'test.md', 1000);
    expect(getSyncMtime(db, 'test.md')).toBe(1000);
    setSyncMtime(db, 'test.md', 2000);
    expect(getSyncMtime(db, 'test.md')).toBe(2000);
  });

  it('returns undefined for unknown path', () => {
    expect(getSyncMtime(db, 'missing.md')).toBeUndefined();
  });

  it('lists all sync paths', () => {
    setSyncMtime(db, 'a.md', 1);
    setSyncMtime(db, 'b.md', 2);
    const paths = getAllSyncPaths(db);
    expect(paths).toEqual(expect.arrayContaining(['a.md', 'b.md']));
    expect(paths).toHaveLength(2);
  });

  it('deleteSyncPath removes entry', () => {
    setSyncMtime(db, 'a.md', 1);
    deleteSyncPath(db, 'a.md');
    expect(getSyncMtime(db, 'a.md')).toBeUndefined();
    expect(getAllSyncPaths(db)).toHaveLength(0);
  });
});
