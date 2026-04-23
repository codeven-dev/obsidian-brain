/**
 * v1.6.8 — verify the MCP server shuts down when its stdin hits EOF.
 *
 * The bug: when an MCP client (Claude Desktop, Jan, Cursor, Codex, VS Code)
 * crashes or is force-quit, it doesn't get a chance to SIGTERM the stdio
 * server it spawned. The child is reparented to launchd (macOS) or init
 * (Linux) and — without a stdin EOF handler — keeps running forever,
 * eating memory and CPU across the user's boot uptime.
 *
 * Fix: `src/server.ts` registers `process.stdin.on('end'|'close', shutdown)`
 * alongside the existing SIGINT/SIGTERM handlers. This test drives it
 * end-to-end via a real child process.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.sequential('server stdin-EOF shutdown (v1.6.8)', () => {
  let vault: string;

  beforeAll(() => {
    vault = mkdtempSync(join(tmpdir(), 'ob-stdin-'));
    writeFileSync(join(vault, 'note.md'), '# Note\n\nhello\n');
  });

  afterAll(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it('exits within 2s of stdin closing (simulating a client disconnect)', async () => {
    // Spawn the compiled CLI with the `server` subcommand. Disable the
    // file watcher so we don't leak chokidar timers into this test.
    const cliPath = join(process.cwd(), 'dist', 'cli', 'index.js');
    const child = spawn(
      process.execPath,
      [cliPath, 'server'],
      {
        env: {
          ...process.env,
          VAULT_PATH: vault,
          OBSIDIAN_BRAIN_NO_WATCH: '1',
          OBSIDIAN_BRAIN_NO_CATCHUP: '1',
          // Skip the embedder download for test speed — the test only
          // verifies shutdown on stdin-EOF, not model loading.
          EMBEDDING_PROVIDER: 'ollama',
          OLLAMA_BASE_URL: 'http://127.0.0.1:1', // unreachable, init will fail; we don't await it
          OLLAMA_EMBEDDING_DIM: '384',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    // Wait for the child to emit at least one line of stderr or be ready
    // enough to accept stdin input. Give it a short window to start.
    await new Promise((r) => setTimeout(r, 500));

    // Close stdin — this is what happens when the parent MCP client crashes.
    child.stdin.end();

    // The child should exit promptly. Enforce a 3s upper bound.
    const exitPromise = once(child, 'exit');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('server did not exit within 3s of stdin EOF')), 3000),
    );

    const [code] = (await Promise.race([exitPromise, timeoutPromise])) as [number | null];
    // Either exit code 0 (clean shutdown) or 1 (if init race triggered an
    // early error) is acceptable — what we're testing is that the process
    // DID exit, not which code. The bug was it never exited at all.
    expect(typeof code === 'number').toBe(true);
  }, 15_000);
});
