import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { insertEdge } from '../../src/store/edges.js';
import { registerDeleteNoteTool } from '../../src/tools/delete-note.js';
import type { ServerContext } from '../../src/context.js';

interface RecordedTool {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (args: any) => Promise<any>;
}

function makeMockServer(): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any;
  registered: RecordedTool[];
} {
  const registered: RecordedTool[] = [];
  const server = {
    tool(
      name: string,
      _d: string,
      _s: unknown,
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
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text);
}

describe('tools/delete_note - G next_actions hint', () => {
  let db: DatabaseHandle;
  let vault: string;

  beforeEach(async () => {
    db = openDb(':memory:');
    vault = await mkdtemp(join(tmpdir(), 'kg-delete-'));
  });

  afterEach(async () => {
    db.close();
    await rm(vault, { recursive: true, force: true });
  });

  function buildCtx(): ServerContext {
    return {
      db,
      config: { vaultPath: vault },
      ensureEmbedderReady: async () => {},
      pipeline: { index: async () => undefined },
    } as unknown as ServerContext;
  }

  it('wraps response in next_actions envelope pointing at rank_notes when edges were removed', async () => {
    const fileRel = 'target.md';
    await writeFile(join(vault, fileRel), '# Target\n', 'utf-8');
    upsertNode(db, { id: fileRel, title: 'Target', content: '', frontmatter: {} });
    upsertNode(db, { id: 'other.md', title: 'Other', content: '', frontmatter: {} });
    // Outbound edge from target — this is what `edgesRemoved` counts.
    insertEdge(db, { sourceId: fileRel, targetId: 'other.md', context: '' });

    const { server, registered } = makeMockServer();
    registerDeleteNoteTool(server, buildCtx());
    const tool = registered.find((t) => t.name === 'delete_note')!;

    const payload = unwrap(await tool.cb({ name: fileRel, confirm: true }));
    expect(payload.context).toBeDefined();
    expect(payload.context.next_actions).toHaveLength(1);
    expect(payload.context.next_actions[0].tool).toBe('rank_notes');
    expect(payload.context.next_actions[0].args.minIncomingLinks).toBe(0);
    expect(payload.context.next_actions[0].reason).toMatch(/orphan/i);
    expect(payload.data.deletedFromIndex.edges).toBe(1);
  });

  it('returns bare result (no envelope) when no edges were removed', async () => {
    const fileRel = 'lonely.md';
    await writeFile(join(vault, fileRel), '# Lonely\n', 'utf-8');
    upsertNode(db, { id: fileRel, title: 'Lonely', content: '', frontmatter: {} });

    const { server, registered } = makeMockServer();
    registerDeleteNoteTool(server, buildCtx());
    const tool = registered.find((t) => t.name === 'delete_note')!;

    const payload = unwrap(await tool.cb({ name: fileRel, confirm: true }));
    expect(payload.context).toBeUndefined();
    expect(payload.deletedFromIndex.edges).toBe(0);
  });
});
