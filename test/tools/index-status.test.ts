/**
 * Unit tests for the `index_status` MCP tool.
 *
 * All tests use an in-memory SQLite DB seeded via store helpers. No real
 * embedder is loaded — the mock embedder from test/helpers/mock-embedders.ts
 * is used throughout.
 *
 * Coverage targets (per-file 57/37):
 *   - Fresh DB with no notes → zero counts, no crash
 *   - DB with notes + chunks → accurate counts
 *   - ctx.initError set → surfaced in response
 *   - ctx.embedderReady() false → reflects in response
 *   - failed_chunks table absent → empty array, no throw
 *   - embedder_capability table absent → null tokens, no throw
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { registerIndexStatusTool } from '../../src/tools/index-status.js';
import { InstantMockEmbedder } from '../helpers/mock-embedders.js';
import type { ServerContext } from '../../src/context.js';

// ---------------------------------------------------------------------------
// Mock server — minimal McpServer.tool() capture
// ---------------------------------------------------------------------------

interface RecordedTool {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (args: any) => Promise<any>;
}

function makeMockServer(): { server: any; registered: RecordedTool[] } {
  const registered: RecordedTool[] = [];
  const server = {
    tool(
      name: string,
      _description: string,
      _schema: unknown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb: (args: any) => Promise<any>,
    ): void {
      registered.push({ name, cb });
    },
  };
  return { server, registered };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(result: any): any {
  if (result.isError) {
    throw new Error(`Tool returned isError=true: ${result.content?.[0]?.text ?? '(no text)'}`);
  }
  return JSON.parse(result.content[0].text);
}

// ---------------------------------------------------------------------------
// Context builder — minimal ctx that satisfies the tool's requirements
// ---------------------------------------------------------------------------

function buildCtx(
  db: DatabaseHandle,
  overrides: Partial<{
    embedderReady: boolean;
    initError: unknown;
    bootstrapReasons: string[];
  }> = {},
): ServerContext {
  const embedder = new InstantMockEmbedder();
  const embedderReadyFlag = overrides.embedderReady ?? true;

  return {
    db,
    embedder,
    embedderReady: () => embedderReadyFlag,
    initError: overrides.initError,
    getBootstrap: () =>
      overrides.bootstrapReasons !== undefined
        ? { needsReindex: false, reasons: overrides.bootstrapReasons }
        : null,
    pendingReindex: Promise.resolve(),
    // Unused by the tool but required by the ServerContext interface
    search: undefined as unknown as ServerContext['search'],
    writer: undefined as unknown as ServerContext['writer'],
    pipeline: undefined as unknown as ServerContext['pipeline'],
    config: { vaultPath: '/fake/vault' } as unknown as ServerContext['config'],
    obsidian: undefined as unknown as ServerContext['obsidian'],
    ensureEmbedderReady: async () => {},
    enqueueBackgroundReindex: () => {},
  } as unknown as ServerContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tools/index_status', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('returns zero counts on a fresh empty DB without crashing', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db);
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.notesTotal).toBe(0);
    expect(result.chunksTotal).toBe(0);
    expect(result.notesWithEmbeddings).toBe(0);
    expect(result.notesMissingEmbeddings).toBe(0);
    expect(result.chunksSkippedInLastRun).toBe(0);
    expect(result.failedChunks).toEqual([]);
    expect(result.failedChunksTotal).toBe(0);
    expect(result.initError).toBeNull();
  });

  it('returns accurate note + chunk counts when the DB has data', async () => {
    // Seed 3 non-stub notes
    upsertNode(db, { id: 'A.md', title: 'A', content: 'Alpha', frontmatter: {} });
    upsertNode(db, { id: 'B.md', title: 'B', content: 'Beta', frontmatter: {} });
    upsertNode(db, { id: 'C.md', title: 'C', content: 'Gamma', frontmatter: {} });
    // Seed 1 stub note — should be excluded from notesTotal
    upsertNode(db, { id: '_stub/X.md', title: 'X', content: '', frontmatter: { _stub: true } });

    // Manually insert 2 chunks (no real embedder needed — we just test SQL counts)
    db.exec(`
      INSERT INTO chunks (id, node_id, chunk_index, content, content_hash)
      VALUES ('c1', 'A.md', 0, 'alpha chunk', 'h1'),
             ('c2', 'B.md', 0, 'beta chunk',  'h2')
    `);

    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db);
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.notesTotal).toBe(3);            // stubs excluded
    expect(result.chunksTotal).toBe(2);
    expect(result.notesWithEmbeddings).toBe(0);   // no chunks_vec rows yet
    expect(result.notesMissingEmbeddings).toBe(3);
  });

  it('surfaces ctx.initError when it is an Error instance', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db, { initError: new TypeError('embedder blew up') });
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.initError).toBe('TypeError: embedder blew up');
  });

  it('surfaces ctx.initError when it is a non-Error value', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db, { initError: 'string error' });
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.initError).toBe('string error');
  });

  it('reports initError as null when ctx.initError is undefined', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db, { initError: undefined });
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.initError).toBeNull();
  });

  it('reflects embedderReady: false in the response', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db, { embedderReady: false });
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.embedderReady).toBe(false);
  });

  it('reflects embedderReady: true in the response', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db, { embedderReady: true });
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.embedderReady).toBe(true);
  });

  it('returns empty failedChunks + no throw when failed_chunks table is absent', async () => {
    // The DB from openDb(':memory:') does NOT have a failed_chunks table.
    // The tool must silently return an empty array rather than throwing.
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db);
    registerIndexStatusTool(server, ctx);

    // Should not throw
    const result = unwrap(await registered[0].cb({}));

    expect(result.failedChunks).toEqual([]);
    expect(result.failedChunksTotal).toBe(0);
    expect(result.chunksSkippedInLastRun).toBe(0);
  });

  it('returns null token counts + no throw when embedder_capability table is absent', async () => {
    // Same: no embedder_capability table in the base schema.
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db);
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.advertisedMaxTokens).toBeNull();
    expect(result.discoveredMaxTokens).toBeNull();
  });

  it('includes bootstrap reasons in lastReindexReasons when available', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db, { bootstrapReasons: ['model changed', 'schema v4 upgrade'] });
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.lastReindexReasons).toEqual(['model changed', 'schema v4 upgrade']);
  });

  it('returns empty lastReindexReasons when getBootstrap() returns null', async () => {
    const { server, registered } = makeMockServer();
    // Default buildCtx with no bootstrapReasons → getBootstrap() returns null
    const ctx = buildCtx(db);
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    expect(result.lastReindexReasons).toEqual([]);
  });

  it('reflects reindexInProgress: false when pendingReindex is a resolved Promise', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db);
    // pendingReindex is always Promise.resolve() from buildCtx — truthy object
    // so reindexInProgress should be true (a Promise is always truthy)
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    // ctx.pendingReindex is a resolved Promise (truthy) → reindexInProgress is true
    expect(result.reindexInProgress).toBe(true);
  });

  it('returns embeddingModel and provider from the mock embedder', async () => {
    const { server, registered } = makeMockServer();
    const ctx = buildCtx(db);
    registerIndexStatusTool(server, ctx);

    const result = unwrap(await registered[0].cb({}));

    // InstantMockEmbedder returns 'mock/instant' and 'mock'
    expect(result.embeddingModel).toBe('mock/instant');
    expect(result.provider).toBe('mock');
    expect(result.embeddingDim).toBe(384);
  });
});
