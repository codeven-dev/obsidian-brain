#!/usr/bin/env node
/**
 * promote.mjs — one-command dev → main release script.
 *
 * Safety model:
 *   - FF-only merges throughout. If main has diverged from dev, the merge
 *     fails loudly rather than creating a merge commit. Fix the divergence
 *     manually, then re-run.
 *   - Clean-tree assertion prevents tagging with uncommitted changes.
 *   - Branch assertion prevents running from main by muscle memory.
 *   - `npm version` fires the existing `version` hook (sync-server-version.mjs
 *     → stages server.json) and `postversion` hook (git push --follow-tags),
 *     so the tag, npm publish push, and version sync are all handled
 *     by the existing pipeline.
 *
 * Usage:
 *   npm run promote              # patch bump (default)
 *   npm run promote -- minor     # minor bump
 *   npm run promote -- major     # major bump
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const VALID_BUMPS = ['patch', 'minor', 'major'];
const bump = process.argv[2] ?? 'patch';

if (!VALID_BUMPS.includes(bump)) {
  console.error(`promote: invalid bump type "${bump}". Must be one of: patch, minor, major.`);
  process.exit(1);
}

/** Run a command, streaming output to the terminal. Throws on non-zero exit. */
function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

/** Run a command and return trimmed stdout. */
function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

// --- 1. Assert current branch is `dev` ---
const currentBranch = capture('git rev-parse --abbrev-ref HEAD');
if (currentBranch !== 'dev') {
  console.error(`promote: must be run from the "dev" branch. Currently on "${currentBranch}".`);
  process.exit(1);
}

// --- 2. Assert working tree is clean ---
const dirty = capture('git status --porcelain');
if (dirty.length > 0) {
  console.error('promote: working tree is not clean. Commit or stash changes first.');
  console.error(dirty);
  process.exit(1);
}

// --- 3. Assert main..dev has at least one commit ---
const ahead = capture('git log main..dev --oneline');
if (ahead.length === 0) {
  console.error('promote: nothing to promote — dev has no commits ahead of main.');
  process.exit(1);
}

// --- 4. Run check-plugin if it exists in package.json scripts ---
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.scripts && pkg.scripts['check-plugin']) {
  console.log('promote: running check-plugin…');
  run('npm run check-plugin');
} else {
  console.log('promote: check-plugin not found in package.json scripts — skipping (Phase 3 adds it).');
}

// --- 5. Fetch origin, checkout main, pull ff-only ---
console.log('\npromote: fetching origin…');
run('git fetch origin');

console.log('promote: switching to main…');
run('git checkout main');

console.log('promote: pulling main (ff-only)…');
run('git pull --ff-only origin main');

// --- 6. Merge dev into main (ff-only) ---
console.log('promote: merging dev into main (ff-only)…');
run('git merge --ff-only dev');

// --- 7. Bump version — fires version + postversion hooks ---
console.log(`\npromote: running npm version ${bump}…`);
run(`npm version ${bump}`);

// Read the new version after the bump
const newPkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const newVersion = newPkg.version;

// --- 8. Return to dev and sync ---
console.log('\npromote: returning to dev…');
run('git checkout dev');

console.log('promote: fast-forwarding dev to match main…');
run('git merge --ff-only main');

// --- 9. Push dev ---
console.log('promote: pushing dev to origin…');
run('git push origin dev');

// --- 10. Summary ---
console.log(`
promote: done.
  Tagged:  v${newVersion}
  main:    at v${newVersion}, pushed (with tag) by postversion hook
  dev:     fast-forwarded to v${newVersion}, pushed
  CI:      release.yml will fire on tag push → npm + MCP Registry + GitHub Release
`);
