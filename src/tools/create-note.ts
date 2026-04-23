import { z } from 'zod';
import { basename } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import { runBackgroundReindex } from './background-reindex.js';
import type { ServerContext } from '../context.js';
import { migrateStubToReal } from '../store/nodes.js';

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
      title: z.string().min(1).describe('Note title. Used as the filename base and auto-injected into frontmatter.'),
      content: z.string().describe('Markdown body (do not include frontmatter here).'),
      directory: z.string().optional().describe('Vault-relative subdirectory to create the note in.'),
      frontmatter: z.record(z.string(), z.unknown()).optional().describe('YAML frontmatter key/value map. `title` is auto-injected unless explicitly set.'),
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

      // Migrate any forward-reference stub for this note's bare stem.
      // e.g. if another note wrote [[NewNote]] before NewNote.md existed,
      // a _stub/NewNote.md was created. Now that the real note is indexed,
      // repoint all inbound edges and delete the stub.
      // This is a DB mutation that must complete before the write returns so
      // future tool calls see the correct edge state.
      const stem = basename(path, '.md');
      if (stem) {
        migrateStubToReal(ctx.db, `_stub/${stem}.md`, path);
      }

      // Fire-and-forget reindex: the write has already succeeded; blocking on
      // the embedder init + index run would make this tool call wait minutes on
      // first run, which MCP clients time out. The watcher path already accepts
      // this eventual-consistency window; this matches.
      runBackgroundReindex(ctx);
      return result;
    },
  );
}
