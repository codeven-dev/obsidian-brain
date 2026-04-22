import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { resolveNodeName } from '../resolve/name-match.js';
import { deleteNote, type DeleteResult } from '../vault/mover.js';

/**
 * Minimal local mirror of the `ToolContext`/`NextAction` envelope shape that
 * `src/tools/hints.ts` (owned by v15-hints) defines. Kept inline here to
 * avoid a branch-merge conflict — v15-hints can consolidate both sites to
 * shared types when the branches meet. Matches the pass-through format the
 * registerTool shim documents in its v1.5.0 comment.
 */
interface NextAction {
  description: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}
interface ToolEnvelope<T> {
  data: T;
  context: { next_actions: NextAction[] };
}

/**
 * `delete_note` — unlink a note from disk and purge it from the index.
 * The `confirm: true` literal is a Zod-level guard so the LLM can't call it
 * accidentally with a missing argument.
 *
 * When the delete removed inbound edges (`edgesRemoved > 0`), the response
 * wraps the plain delete result in a `{data, context: {next_actions}}`
 * envelope suggesting the caller rerun `rank_notes` with `minIncomingLinks:
 * 0` to surface freshly-orphaned notes. Bare callers that don't care can
 * ignore `context` — `data` has the same shape as the pre-envelope payload.
 */
export function registerDeleteNoteTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'delete_note',
    'Permanently delete a note. Removes the file from disk AND its index rows (edges, embedding, node). Requires `confirm: true` to guard against accidents. When the delete removes inbound edges, the response is wrapped in a next_actions envelope suggesting a follow-up `rank_notes(method=pagerank, minIncomingLinks=0)` to spot newly orphaned notes.',
    {
      name: z.string(),
      confirm: z.literal(true),
    },
    async (args) => {
      const { name } = args;

      const fileRelPath = resolveToSinglePath(name, ctx);
      const result = await deleteNote(ctx.config.vaultPath, fileRelPath, ctx.db);

      let payload: DeleteResult | (DeleteResult & { reindex: string; reindexError: string }) = result;
      try {
        await ctx.ensureEmbedderReady();
        await ctx.pipeline.index(ctx.config.vaultPath);
      } catch (err) {
        payload = { ...result, reindex: 'failed', reindexError: String(err) };
      }

      const edgesRemoved = result.deletedFromIndex.edges;
      if (edgesRemoved > 0) {
        const envelope: ToolEnvelope<typeof payload> = {
          data: payload,
          context: {
            next_actions: [
              {
                description: 'Check for newly orphaned notes',
                tool: 'rank_notes',
                args: { metric: 'influence', minIncomingLinks: 0 },
                reason: `Removed ${edgesRemoved} edge${edgesRemoved === 1 ? '' : 's'} — some notes may now be orphans`,
              },
            ],
          },
        };
        return envelope;
      }

      return payload;
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
