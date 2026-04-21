#!/usr/bin/env node
import { Command } from 'commander';
import { createContext } from '../context.js';

const program = new Command();
program
  .name('obsidian-brain')
  .description('CLI for obsidian-brain: index the vault, run searches, inspect the graph.')
  .version('0.1.0');

program
  .command('index')
  .description('Scan the vault and update the knowledge-graph index (incremental)')
  .option('-r, --resolution <n>', 'Louvain resolution', parseFloat, 1.0)
  .action(async (opts: { resolution: number }) => {
    const ctx = await createContext();
    await ctx.ensureEmbedderReady();
    const stats = await ctx.pipeline.index(ctx.config.vaultPath, opts.resolution);
    process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
  });

program
  .command('search <query>')
  .description('Semantic search over the vault')
  .option('-l, --limit <n>', 'Max results', parseInt, 10)
  .option('-m, --mode <mode>', 'semantic | fulltext', 'semantic')
  .action(
    async (
      query: string,
      opts: { limit: number; mode: 'semantic' | 'fulltext' },
    ) => {
      const ctx = await createContext();
      let results;
      if (opts.mode === 'fulltext') {
        results = ctx.search.fulltext(query, opts.limit);
      } else {
        await ctx.ensureEmbedderReady();
        results = await ctx.search.semantic(query, opts.limit);
      }
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    },
  );

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(
    `CLI error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
