import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type DatabaseHandle } from '../../src/store/db.js';
import { upsertNode } from '../../src/store/nodes.js';
import { upsertCommunity } from '../../src/store/communities.js';
import { registerDetectThemesTool } from '../../src/tools/detect-themes.js';
import type { ServerContext } from '../../src/context.js';

/**
 * Minimal mock of `McpServer.tool()` used by the tool registrar. Captures the
 * handler callback so tests can invoke it directly with args.
 */
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

/**
 * Unwrap the MCP `content` envelope produced by `registerTool`. Returns the
 * parsed JSON body from the single text block.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(result: any): any {
  expect(result.isError).toBeFalsy();
  const text = result.content[0].text;
  return JSON.parse(text);
}

describe('tools/detect_themes - A2 read-path consistency', () => {
  let db: DatabaseHandle;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('adds staleMembersFiltered: 0 when cache is fresh', async () => {
    upsertNode(db, { id: 'a.md', title: 'A', content: '', frontmatter: {} });
    upsertNode(db, { id: 'b.md', title: 'B', content: '', frontmatter: {} });
    upsertCommunity(db, {
      id: 0,
      label: 'ab',
      summary: 'Key members: A, B. 2 nodes total.',
      nodeIds: ['a.md', 'b.md'],
    });

    const { server, registered } = makeMockServer();
    registerDetectThemesTool(server, { db } as unknown as ServerContext);
    const tool = registered.find((t) => t.name === 'detect_themes')!;

    const payload = unwrap(await tool.cb({}));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].staleMembersFiltered).toBe(0);
    expect(payload[0].nodeIds).toEqual(['a.md', 'b.md']);
    expect(payload[0].summary).toContain('A, B');
  });

  it('filters ghost ids at read time and regenerates summary', async () => {
    // `ghost.md` is named in the cache but never existed as a node — the
    // half-invalidated cache condition the v1.4.0 feedback proved.
    upsertNode(db, { id: 'a.md', title: 'A', content: '', frontmatter: {} });
    upsertCommunity(db, {
      id: 0,
      label: 'a',
      summary: 'Key members: A, Ghost. Tags: ghost-tag. 2 nodes total.',
      nodeIds: ['a.md', 'ghost.md'],
    });

    const { server, registered } = makeMockServer();
    registerDetectThemesTool(server, { db } as unknown as ServerContext);
    const tool = registered.find((t) => t.name === 'detect_themes')!;

    const payload = unwrap(await tool.cb({}));
    const [cluster] = payload;
    expect(cluster.staleMembersFiltered).toBe(1);
    expect(cluster.nodeIds).toEqual(['a.md']);
    expect(cluster.summary).not.toContain('Ghost');
    expect(cluster.summary).not.toContain('ghost-tag');
    expect(cluster.summary).toContain('1 nodes total');
  });

  it('themeId drill-down reconciles the single returned cluster', async () => {
    upsertNode(db, { id: 'a.md', title: 'A', content: '', frontmatter: {} });
    upsertCommunity(db, {
      id: 3,
      label: 'three',
      summary: 'Key members: A, Ghost. 2 nodes total.',
      nodeIds: ['a.md', 'ghost.md'],
    });

    const { server, registered } = makeMockServer();
    registerDetectThemesTool(server, { db } as unknown as ServerContext);
    const tool = registered.find((t) => t.name === 'detect_themes')!;

    const cluster = unwrap(await tool.cb({ themeId: '3' }));
    expect(cluster).not.toBeNull();
    expect(cluster.staleMembersFiltered).toBe(1);
    expect(cluster.nodeIds).toEqual(['a.md']);
    expect(cluster.summary).not.toContain('Ghost');
    expect(cluster.summary).toContain('1 nodes total');
  });
});
