#!/usr/bin/env node
/**
 * Syncs `server.json` version fields from `package.json`.
 *
 * Wired into the `version` npm-lifecycle hook so that `npm version patch`
 * (or minor/major) updates both files in the same commit — keeping
 * `package.json.version`, `server.json.version`, and
 * `server.json.packages[0].version` in lockstep locally.
 *
 * The release workflow also rewrites both before publishing, but doing it
 * locally too keeps the committed repo state honest about which version
 * main is tracking.
 *
 * Runs after `npm version` has written the new version to package.json but
 * before it commits — `process.env.npm_package_version` is the post-bump
 * value in that context.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env.npm_package_version;
if (!version) {
  console.error(
    'sync-server-version: npm_package_version not set — run via `npm version` (or set the env var manually).',
  );
  process.exit(1);
}

const path = new URL('../server.json', import.meta.url);
const src = readFileSync(path, 'utf8');
const j = JSON.parse(src);

j.version = version;
if (Array.isArray(j.packages) && j.packages[0]) {
  j.packages[0].version = version;
} else {
  console.error('sync-server-version: server.json has no packages[0] entry — aborting.');
  process.exit(1);
}

// Preserve a trailing newline (standard for JSON files checked into git).
writeFileSync(path, `${JSON.stringify(j, null, 2)}\n`);
console.log(`sync-server-version: server.json bumped to ${version}`);
