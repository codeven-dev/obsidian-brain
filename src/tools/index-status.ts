import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { getMetadata } from '../store/metadata.js';

const NoArgs = z.object({}).strict();

export function registerIndexStatusTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'index_status',
    'Report the current state of the vault index: embedder model + dim, count of notes / chunks indexed, chunks skipped during the last reindex (if any), advertised vs discovered max tokens, last reindex reasons, whether a reindex is currently in flight, and the last init error. Read-only — does not mutate anything.',
    NoArgs.shape,
    async () => {
      const db = ctx.db;

      // Pure SQL reads — no embedder touch
      const notesTotal = (db.prepare('SELECT COUNT(*) AS n FROM nodes WHERE frontmatter NOT LIKE ?').get('%_stub":true%') as { n: number }).n;
      const notesWithEmbeddings = (db.prepare(
        'SELECT COUNT(DISTINCT node_id) AS n FROM chunks JOIN chunks_vec ON chunks.rowid = chunks_vec.rowid'
      ).get() as { n: number }).n;
      const chunksTotal = (db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }).n;

      // NOTE: embedder_capability + failed_chunks tables are added by the
      // V1.7.0-AdaptiveCapacity agent in a separate worktree. This agent works
      // from v1.6.21 HEAD which doesn't have them yet. Defensive pattern:
      // try-catch the SELECTs so the tool returns gracefully even if the
      // schema hasn't caught up. When both agents merge to dev the catch
      // becomes dead code (tables exist); intentional belt-and-braces for
      // the cherry-pick interleaving.
      let failedChunks: Array<{ note: string; reason: string; at: number }> = [];
      let discoveredMaxTokens: number | null = null;
      let advertisedMaxTokens: number | null = null;
      try {
        const rows = db.prepare(
          'SELECT note_id AS note, reason, failed_at AS at FROM failed_chunks ORDER BY failed_at DESC LIMIT 50'
        ).all() as Array<{ note: string; reason: string; at: number }>;
        failedChunks = rows;
      } catch { /* table not yet present — ignore */ }
      try {
        const cap = db.prepare(
          'SELECT advertised_max_tokens AS adv, discovered_max_tokens AS disc FROM embedder_capability WHERE embedder_id = ?'
        ).get(ctx.embedder.modelIdentifier()) as { adv: number | null; disc: number | null } | undefined;
        if (cap) {
          advertisedMaxTokens = cap.adv;
          discoveredMaxTokens = cap.disc;
        }
      } catch { /* ignore */ }

      // Read existing bootstrap-reported fields
      const bootstrap = ctx.getBootstrap();
      const lastReindexReasons = bootstrap?.reasons ?? [];

      return {
        embeddingModel: getMetadata(db, 'embedding_model') ?? ctx.embedder.modelIdentifier(),
        embeddingDim: Number(getMetadata(db, 'embedding_dim') ?? ctx.embedder.dimensions()),
        provider: getMetadata(db, 'embedder_provider') ?? ctx.embedder.providerName(),
        notesTotal,
        notesWithEmbeddings,
        notesMissingEmbeddings: notesTotal - notesWithEmbeddings,
        chunksTotal,
        chunksSkippedInLastRun: failedChunks.length,
        failedChunks: failedChunks.slice(0, 10),  // first 10 for the response
        failedChunksTotal: failedChunks.length,
        advertisedMaxTokens,
        discoveredMaxTokens,
        lastReindexReasons,
        reindexInProgress: ctx.pendingReindex !== undefined,
        embedderReady: ctx.embedderReady(),
        initError: ctx.initError instanceof Error
          ? `${ctx.initError.name}: ${ctx.initError.message}`
          : (ctx.initError !== undefined ? String(ctx.initError) : null),
      };
    },
  );
}
