import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';

/**
 * `create_note` — write a new `.md` file into the vault and re-index so it
 * shows up in semantic search / graph tools immediately.
 */
export function registerCreateNoteTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'create_note',
    'Create a new note in the vault with a title, body, and optional YAML frontmatter. The new note is indexed immediately so semantic search and graph tools can find it. Auto-injects a `title:` field into frontmatter matching the note title unless frontmatter already has one.',
    {
      title: z.string().min(1),
      content: z.string(),
      directory: z.string().optional(),
      frontmatter: z.record(z.string(), z.unknown()).optional(),
    },
    async (args) => {
      const { title, content, directory, frontmatter } = args;

      const path = ctx.writer.createNode({
        title,
        content,
        directory,
        frontmatter: frontmatter ?? {},
      });

      const result = { path, title };

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
