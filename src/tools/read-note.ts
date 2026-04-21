import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';
import type { ServerContext } from '../context.js';
import { resolveNodeName } from '../resolve/name-match.js';
import { getNode } from '../store/nodes.js';
import {
  getEdgeSummariesBySource,
  getEdgeSummariesByTarget,
  getEdgesBySource,
  getEdgesByTarget,
} from '../store/edges.js';

export function registerReadNoteTool(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    'read_note',
    "Read a note's content. Brief mode (default) returns title + metadata + linked-note titles; full mode returns full content + edge context.",
    {
      name: z.string(),
      mode: z.enum(['brief', 'full']).optional(),
      maxContentLength: z.number().int().positive().optional(),
    },
    async (args) => {
      const { name, mode, maxContentLength } = args;
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

      const id = first.nodeId;
      const node = getNode(ctx.db, id);
      if (!node) throw new Error(`No note found matching "${name}"`);

      const mode_ = mode ?? 'brief';
      if (mode_ === 'brief') {
        const outgoing = getEdgeSummariesBySource(ctx.db, id).map((e) => ({
          targetId: e.nodeId,
          targetTitle: e.title,
        }));
        const incoming = getEdgeSummariesByTarget(ctx.db, id).map((e) => ({
          sourceId: e.nodeId,
          sourceTitle: e.title,
        }));
        return {
          id: node.id,
          title: node.title,
          frontmatter: node.frontmatter,
          outgoing,
          incoming,
        };
      }

      const max = maxContentLength ?? 2000;
      const content =
        node.content.length > max ? node.content.slice(0, max) : node.content;
      const outgoing = getEdgesBySource(ctx.db, id).map((e) => {
        const target = getNode(ctx.db, e.targetId);
        return {
          targetId: e.targetId,
          targetTitle: target?.title ?? e.targetId,
          context: e.context,
        };
      });
      const incoming = getEdgesByTarget(ctx.db, id).map((e) => {
        const source = getNode(ctx.db, e.sourceId);
        return {
          sourceId: e.sourceId,
          sourceTitle: source?.title ?? e.sourceId,
          context: e.context,
        };
      });
      return {
        id: node.id,
        title: node.title,
        frontmatter: node.frontmatter,
        content,
        outgoing,
        incoming,
      };
    },
  );
}
