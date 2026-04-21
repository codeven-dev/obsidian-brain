/**
 * Tiny stdio JSON-RPC client for testing an MCP server.
 *
 * Framing is newline-delimited JSON (one object per line) — the MCP stdio
 * transport does NOT use HTTP-style Content-Length framing.
 *
 * This intentionally does NOT depend on `@modelcontextprotocol/sdk` — the
 * point of the smoke test is to hand-roll the wire protocol so we catch
 * regressions the SDK might paper over.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type Resolver = {
  resolve: (value: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export class McpStdioClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, Resolver>();
  private stdoutBuf = '';
  private exited = false;
  public readonly stderrLog: string[] = [];

  constructor(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
  ) {
    this.child = spawn(command, args, {
      env,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrLog.push(chunk);
    });
    this.child.on('exit', (code, signal) => {
      this.exited = true;
      for (const [, r] of this.pending) {
        clearTimeout(r.timer);
        r.reject(new Error(`server exited code=${code} signal=${signal}`));
      }
      this.pending.clear();
    });
    this.child.on('error', (err) => {
      this.exited = true;
      for (const [, r] of this.pending) {
        clearTimeout(r.timer);
        r.reject(err);
      }
      this.pending.clear();
    });
  }

  private onStdout(chunk: string): void {
    this.stdoutBuf += chunk;
    let nl: number;
    while ((nl = this.stdoutBuf.indexOf('\n')) !== -1) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line.length === 0) continue;
      let msg: JsonRpcResponse | JsonRpcNotification;
      try {
        msg = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
      } catch {
        // Non-JSON on stdout shouldn't happen — log to stderr trace so it's visible.
        this.stderrLog.push(`[stdout-nonjson] ${line}\n`);
        continue;
      }
      if ('id' in msg && typeof msg.id === 'number') {
        const r = this.pending.get(msg.id);
        if (r) {
          this.pending.delete(msg.id);
          clearTimeout(r.timer);
          r.resolve(msg);
        }
      }
      // Notifications (no id) are ignored — the smoke test doesn't need them.
    }
  }

  sendNotification(method: string, params?: unknown): void {
    if (this.exited) throw new Error('server exited');
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) };
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  sendRequest(method: string, params?: unknown, timeoutMs = 5000): Promise<JsonRpcResponse> {
    if (this.exited) return Promise.reject(new Error('server exited'));
    const id = this.nextId++;
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify(msg) + '\n');
    });
  }

  async shutdown(timeoutMs = 3000): Promise<void> {
    if (this.exited) return;
    try {
      this.child.stdin.end();
    } catch {
      // ignore
    }
    this.child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      if (this.exited) return resolve();
      const t = setTimeout(() => {
        try { this.child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve();
      }, timeoutMs);
      this.child.on('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  stderrText(): string {
    return this.stderrLog.join('');
  }
}
