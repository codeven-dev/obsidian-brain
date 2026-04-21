import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

type InferShape<Shape extends z.ZodRawShape> = z.infer<z.ZodObject<Shape>>;

/**
 * Register an MCP tool with a Zod input schema + a handler that returns any
 * JSON-serializable result. The helper:
 *   - wraps the result in the MCP `content` format
 *   - catches exceptions and returns `isError: true` responses
 *   - JSON-stringifies objects (and leaves strings untouched)
 *
 * Use `z.record(z.string(), z.unknown())` for open-ended map params — single-arg
 * `z.record` breaks tools/list under Zod v4 ("_zod" error).
 */
export function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  schema: Shape,
  handler: (args: InferShape<Shape>) => Promise<unknown>,
): void {
  // The MCP SDK's callback type is narrower than what we return from the
  // try/catch branches; cast on the way in to keep the caller API clean.
  const cb = async (args: InferShape<Shape>) => {
    try {
      const result = await handler(args);
      const text =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool(name, description, schema, cb);
}
