import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { getAllCommunities, getCommunity } from '../store/communities.js';

export function registerDetectThemesTool(
  server: McpServer,
  ctx: ServerContext,
): void {
  registerTool(
    server,
    'detect_themes',
    'List auto-detected topic clusters across the vault. Pass a theme id or label to drill into one cluster.',
    {
      themeId: z.string().optional(),
      resolution: z.number().positive().optional(),
    },
    async (args) => {
      const { themeId } = args;
      if (themeId !== undefined) {
        return getCommunity(ctx.db, themeId);
      }
      return getAllCommunities(ctx.db);
    },
  );
}
