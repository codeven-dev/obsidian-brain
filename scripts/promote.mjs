#!/usr/bin/env node
/**
 * promote.mjs — one-command dev → main release script.
 *
 * Safety model:
 *   - FF-only merges throughout. If main has diverged from dev (or from the
 *     target commit), the merge fails loudly rather than creating a merge
 *     commit. Fix the divergence manually, then re-run.
 *   - Clean-tree assertion prevents tagging with uncommitted changes.
 *   - Branch assertion prevents running from main by muscle memory.
 *   - `npm version` fires the existing `version` hook (sync-server-version.mjs
 *     → stages server.json) and `postversion` hook (git push --follow-tags),
 *     so the tag, main push, and server.json sync are all handled by the
 *     existing pipeline.
 *   - When a specific commit is promoted (not dev HEAD), dev has commits
 *     beyond what shipped. We auto-rebase dev onto main (preserving those
 *     commits on top of the bump commit) and force-push-with-lease. This
 *     rewrites dev history — fine for a solo workflow, but if you share dev
 *     with anyone else you need to know this.
 *
 * Usage:
 *   npm run promote                             # patch, ship all of dev
 *   npm run promote -- minor                    # minor, ship all of dev
 *   npm run promote -- major                    # major, ship all of dev
 *   npm run promote -- <commit>                 # patch, ship up to <commit> on dev
 *   npm run promote -- minor <commit>           # minor, ship up to <commit>
 *   npm run promote -- major <commit>           # major, ship up to <commit>
 *   npm run promote -- <commit> minor           # args are order-independent
 *
 * <commit> can be any ref git understands: full SHA, short SHA, tag, branch.
 * It must be reachable from dev (an ancestor of dev HEAD) and must be ahead
 * of main (there must be something to ship).
 *
 * Flags `--patch` / `--minor` / `--major` also work (leading dashes are
 * stripped for convenience).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const VALID_BUMPS = new Set(['patch', 'minor', 'major']);

// --- Parse args — order-independent, strip leading dashes from bump flags ---
let bump = 'patch';
let targetRef = null;

for (const raw of process.argv.slice(2)) {
  const arg = raw.replace(/^--?/, '');
  if (VALID_BUMPS.has(arg)) {
    bump = arg;
  } else if (raw.startsWith('-')) {
    console.error(`promote: unknown flag "${raw}". Valid flags: --patch, --minor, --major.`);
    process.exit(1);
  } else if (targetRef !== null) {
    console.error(`promote: got two non-bump args ("${targetRef}" and "${raw}"). Expected at most one commit ref.`);
    process.exit(1);
  } else {
    targetRef = raw;
  }
}

/** Run a command, streaming output to the terminal. Throws on non-zero exit. */
function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

/** Run a command and return trimmed stdout. Throws on non-zero exit. */
function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

/** Run a command and return true iff it exits 0 (swallows stderr). */
function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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

// --- 3. Fetch origin so local main + dev reflect the remote before we decide anything ---
console.log('promote: fetching origin…');
run('git fetch origin');

// --- 4. Resolve target (default: dev HEAD) + validate reachability ---
const devHead = capture('git rev-parse dev');
let targetSha;
let targetShort;
let isCherryPick = false;

if (targetRef === null) {
  targetSha = devHead;
  targetShort = capture(`git rev-parse --short ${targetSha}`);
} else {
  try {
    targetSha = capture(`git rev-parse ${targetRef}^{commit}`);
  } catch {
    console.error(`promote: "${targetRef}" is not a valid commit ref.`);
    process.exit(1);
  }
  targetShort = capture(`git rev-parse --short ${targetSha}`);

  // Target must be reachable from dev (ancestor or equal to dev HEAD)
  if (!tryRun(`git merge-base --is-ancestor ${targetSha} dev`)) {
    console.error(`promote: commit ${targetShort} is not reachable from dev.`);
    console.error(`  It must be an ancestor of (or equal to) dev's HEAD.`);
    process.exit(1);
  }

  isCherryPick = targetSha !== devHead;
}

// --- 5. Assert main..<target> has at least one commit (something to ship) ---
const ahead = capture(`git log main..${targetSha} --oneline`);
if (ahead.length === 0) {
  console.error(`promote: nothing to promote — ${isCherryPick ? `${targetShort} is` : 'dev is'} not ahead of main.`);
  process.exit(1);
}

console.log(`promote: target is ${targetShort}${isCherryPick ? ' (cherry-pick — dev has commits beyond this)' : ' (dev HEAD)'}.`);
console.log(`promote: shipping ${ahead.split('\n').length} commit(s) with bump=${bump}.`);

// --- 6. Run check-plugin if it exists in package.json scripts ---
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.scripts && pkg.scripts['check-plugin']) {
  console.log('promote: running check-plugin…');
  run('npm run check-plugin');
}

// --- 7. Switch to main, pull, FF-merge to target ---
console.log('\npromote: switching to main…');
run('git checkout main');

console.log('promote: pulling main (ff-only)…');
run('git pull --ff-only origin main');

console.log(`promote: fast-forwarding main to ${targetShort}…`);
run(`git merge --ff-only ${targetSha}`);

// --- 8. Bump version — fires version + postversion hooks ---
console.log(`\npromote: running npm version ${bump}…`);
run(`npm version ${bump}`);

// Read the new version after the bump
const newPkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const newVersion = newPkg.version;

// --- 9. Return to dev and sync ---
console.log('\npromote: returning to dev…');
run('git checkout dev');

if (!isCherryPick) {
  // Normal case: dev was shipped in full. main = dev + bump. FF dev → main works.
  console.log('promote: fast-forwarding dev to match main…');
  run('git merge --ff-only main');
  console.log('promote: pushing dev to origin…');
  run('git push origin dev');
} else {
  // Cherry-pick case: main = <target> + bump. dev has commits beyond <target>.
  // Rebase dev onto main so dev includes the bump commit + dev's extra commits
  // on top of it. This rewrites dev history, so push requires --force-with-lease.
  console.log('promote: dev has commits beyond the promoted target — rebasing dev onto main…');
  run('git rebase main');
  console.log('promote: force-pushing dev (with --force-with-lease) to origin…');
  run('git push --force-with-lease origin dev');
}

// --- 10. Summary ---
console.log(`
promote: done.
  Tagged:  v${newVersion} at ${targetShort}${isCherryPick ? ' (cherry-pick)' : ''}
  main:    at v${newVersion}, pushed (with tag) by postversion hook
  dev:     ${isCherryPick ? 'rebased onto main + force-pushed' : `fast-forwarded to v${newVersion}, pushed`}
  CI:      release.yml will fire on tag push → npm + MCP Registry + GitHub Release
`);
