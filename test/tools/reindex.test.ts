import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { z } from 'zod';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { getAllCommunities } from '../../src/store/communities.js';
import { Embedder } from '../../src/embeddings/embedder.js';
import { IndexPipeline } from '../../src/pipeline/indexer.js';
import { registerReindexTool } from '../../src/tools/reindex.js';
import type { ServerContext } from '../../src/context.js';

const FIXTURE_VAULT = join(import.meta.dirname, '..', 'fixtures', 'vault');

/**
 * Mock of `McpServer.tool()` that also replays the schema-based input
 * validation the real MCP SDK applies before dispatching to the handler.
 * This is load-bearing for v1.4.0 — A3 moved `resolution` from `.optional()`
 * to `.default(1.0)`, so the SDK must actually fill in the default before
 * the handler sees its args. A mock that skips validation would hide the
 * whole behaviour change.
 */
interface RecordedTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
}

function makeValidatingMockServer(): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any;
  registered: RecordedTool[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke: (name: string, rawArgs: Record<string, unknown>) => Promise<any>;
} {
  const registered: RecordedTool[] = [];
  const server = {
    tool(
      name: string,
      description: string,
      schema: Record<string, z.ZodTypeAny>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb: (args: any) => Promise<any>,
    ): void {
      registered.push({ name, description, cb, schema });
    },
  };
  const invoke = async (
    name: string,
    rawArgs: Record<string, unknown>,
  ): Promise<unknown> => {
    const tool = registered.find((t) => t.name === name);
    if (!tool) throw new Error(`tool not registered: ${name}`);
    const parsed = z.object(tool.schema).parse(rawArgs);
    return tool.cb(parsed);
  };
  return { server, registered, invoke };
}

/**
 * The v1.4.0 feedback proved that bare `reindex({})` was a no-op despite the
 * tool description promising a "full re-index". Root cause: `resolution` was
 * `.optional()` in the Zod schema, which left it `undefined`, which meant
 * the pipeline only refreshed communities when files actually changed. We
 * now default `resolution` to 1.0 so bare calls actually do the work.
 */
describe.sequential('tools/reindex - A3 default resolution', () => {
  let db: DatabaseHandle;
  let embedder: Embedder;
  let pipeline: IndexPipeline;

  beforeAll(async () => {
    db = openDb(':memory:');
    embedder = new Embedder();
    await embedder.init();
    pipeline = new IndexPipeline(db, embedder);
  }, 180_000);

  afterAll(async () => {
    db.close();
    await embedder.dispose();
  });

  it('bare `reindex({})` triggers community detection on a non-empty vault', async () => {
    const { server, invoke } = makeValidatingMockServer();
    const ctx = {
      db,
      pipeline,
      config: { vaultPath: FIXTURE_VAULT },
      ensureEmbedderReady: async () => undefined,
    } as unknown as ServerContext;
    registerReindexTool(server, ctx);

    const result = await invoke('reindex', {});
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.communitiesDetected).toBeGreaterThan(0);
    expect(getAllCommunities(db).length).toBeGreaterThan(0);
  }, 180_000);
});
