import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { resolveNodeName } from '../resolve/name-match.js';
import { moveNote } from '../vault/mover.js';

/**
 * `move_note` — rename/move a note on disk. Returns `{ oldPath, newPath }`.
 * Link fix-up happens via the indexer on re-scan, not here.
 */
export function registerMoveNoteTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'move_note',
    'Rename or move a note. Existing wiki-links pointing at the old name will break until a re-index and link fix-up catch up — use carefully.',
    {
      source: z.string(),
      destination: z.string().min(1),
    },
    async (args) => {
      const { source, destination } = args;

      const fileRelPath = resolveToSinglePath(source, ctx);
      const result = await moveNote(ctx.config.vaultPath, fileRelPath, destination);

      try {
        await ctx.ensureEmbedderReady();
        await ctx.pipeline.index(ctx.config.vaultPath);
      } catch (err) {
        return { ...result, reindex: 'failed', reindexError: String(err) };
      }

      return result;
    },
  );
}

function resolveToSinglePath(name: string, ctx: ServerContext): string {
  const matches = resolveNodeName(name, ctx.db);
  if (matches.length === 0) {
    throw new Error(`No note found matching "${name}"`);
  }
  const first = matches[0]!;
  const ambiguous =
    matches.length > 1 &&
    (first.matchType === 'substring' ||
      first.matchType === 'case-insensitive' ||
      first.matchType === 'alias');
  if (ambiguous) {
    const candidates = matches
      .slice(0, 10)
      .map((m) => `- ${m.title} (${m.nodeId})`)
      .join('\n');
    throw new Error(
      `Multiple notes match "${name}". Please be more specific. Candidates:\n${candidates}`,
    );
  }
  return first.nodeId;
}
