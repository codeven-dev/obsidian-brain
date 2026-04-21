import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { allNodeIds, getNode } from '../store/nodes.js';

export function registerListNotesTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'list_notes',
    'List notes in the vault. Optionally filter by directory prefix or by tag (from frontmatter).',
    {
      directory: z.string().optional(),
      tag: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
    async (args) => {
      const { directory, tag, limit } = args;
      const ids = allNodeIds(ctx.db);
      const results: Array<{
        id: string;
        title: string;
        tags: string[];
        frontmatter: Record<string, unknown>;
      }> = [];
      const cap = limit ?? 100;

      for (const id of ids) {
        if (directory !== undefined) {
          if (!(id.startsWith(directory + '/') || id === directory)) continue;
        }
        const node = getNode(ctx.db, id);
        if (!node) continue;
        const tags = Array.isArray(node.frontmatter.tags)
          ? (node.frontmatter.tags as string[])
          : [];
        if (tag !== undefined && !tags.includes(tag)) continue;

        results.push({
          id: node.id,
          title: node.title,
          tags,
          frontmatter: node.frontmatter,
        });
        if (results.length >= cap) break;
      }

      return results;
    },
  );
}
