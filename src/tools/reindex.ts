import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';

export function registerReindexTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'reindex',
    'Force a full re-index of the vault. Normally the index is rebuilt automatically on a schedule; call this only if a tool reported stale results.',
    {
      resolution: z.number().positive().optional(),
    },
    async (args) => {
      const { resolution } = args;
      await ctx.ensureEmbedderReady();
      return ctx.pipeline.index(ctx.config.vaultPath, resolution ?? 1.0);
    },
  );
}
