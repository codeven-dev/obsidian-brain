import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { resolveNodeName } from '../resolve/name-match.js';
import { deleteNote } from '../vault/mover.js';

/**
 * `delete_note` — unlink a note from disk and purge it from the index.
 * The `confirm: true` literal is a Zod-level guard so the LLM can't call it
 * accidentally with a missing argument.
 */
export function registerDeleteNoteTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'delete_note',
    'Permanently delete a note. Removes the file from disk AND its index rows (edges, embedding, node). Requires `confirm: true` to guard against accidents.',
    {
      name: z.string(),
      confirm: z.literal(true),
    },
    async (args) => {
      const { name } = args;

      const fileRelPath = resolveToSinglePath(name, ctx);
      const result = await deleteNote(ctx.config.vaultPath, fileRelPath, ctx.db);

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
