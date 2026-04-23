#!/usr/bin/env node
/**
 * setup-branch-protection.mjs — apply GitHub rulesets to `main` and `dev`.
 *
 * Idempotent: re-run safely. If a ruleset with the same name already exists,
 * it is updated in place rather than duplicated.
 *
 * Applied rules:
 *
 *   main (ruleset "obsidian-brain/main"):
 *     - Block force-push              (non_fast_forward)
 *     - Block deletion                (deletion)
 *     - Require linear history        (required_linear_history)
 *
 *   dev (ruleset "obsidian-brain/dev"):
 *     - Block deletion                (deletion)
 *     (Force-push is intentionally allowed — the cherry-pick branch of
 *     `npm run promote` uses `git push --force-with-lease origin dev` after
 *     rebasing dev onto main. Blocking it would break that flow.)
 *
 * Not yet applied — add manually via the GitHub UI once CI on dev goes green:
 *
 *   - Required status check: "Build, test, smoke, docs" must pass before PRs
 *     can merge to main. Adding it while CI is red would block every PR.
 *     Settings → Rules → obsidian-brain/main → Add rule → Require status
 *     checks to pass → pick "Build, test, smoke, docs" from the dropdown.
 *
 * Usage:
 *   npm run setup:protection
 *   npm run setup:protection -- --dry-run    # print the API calls, don't send
 *
 * Requires: `gh` CLI authenticated as a repo admin.
 */
import { execSync } from 'node:child_process';

const REPO = 'sweir1/obsidian-brain';
const DRY = process.argv.includes('--dry-run');

/** Shell out with inherited stdio (for dry-run printing). */
function run(cmd) {
  if (DRY) {
    console.log(`[dry-run] ${cmd}`);
    return '';
  }
  return execSync(cmd, { encoding: 'utf8' });
}

/** POST or PUT a ruleset JSON via `gh api`. Idempotent: looks up existing by name. */
function upsertRuleset(ruleset) {
  const name = ruleset.name;
  // Look up existing ruleset by name
  const existing = JSON.parse(
    execSync(`gh api repos/${REPO}/rulesets`, { encoding: 'utf8' }),
  );
  const match = existing.find((r) => r.name === name);

  const body = JSON.stringify(ruleset);
  // Write to tempfile — gh api prefers file input for complex bodies
  const tmp = `/tmp/ruleset-${Date.now()}.json`;
  execSync(`cat > ${tmp} <<'EOF'\n${body}\nEOF`);

  if (match) {
    console.log(`updating existing ruleset "${name}" (id ${match.id})`);
    run(
      `gh api --method PUT repos/${REPO}/rulesets/${match.id} --input ${tmp}`,
    );
  } else {
    console.log(`creating new ruleset "${name}"`);
    run(
      `gh api --method POST repos/${REPO}/rulesets --input ${tmp}`,
    );
  }

  execSync(`rm -f ${tmp}`);
}

const mainRuleset = {
  name: 'obsidian-brain/main',
  target: 'branch',
  enforcement: 'active',
  conditions: {
    ref_name: {
      include: ['refs/heads/main'],
      exclude: [],
    },
  },
  rules: [
    { type: 'non_fast_forward' }, // blocks force pushes
    { type: 'deletion' },
    { type: 'required_linear_history' },
  ],
};

const devRuleset = {
  name: 'obsidian-brain/dev',
  target: 'branch',
  enforcement: 'active',
  conditions: {
    ref_name: {
      include: ['refs/heads/dev'],
      exclude: [],
    },
  },
  rules: [
    { type: 'deletion' },
  ],
};

console.log(`setup-branch-protection: target repo = ${REPO}${DRY ? ' (DRY RUN)' : ''}\n`);
upsertRuleset(mainRuleset);
upsertRuleset(devRuleset);

console.log(`
setup-branch-protection: done.

Applied:
  - main: block force-push, block deletion, require linear history
  - dev:  block deletion (force-push allowed for cherry-pick promote rebase)

To add "required CI check" later (once CI is green on dev):
  GitHub UI → Settings → Rules → obsidian-brain/main → Add rule
     → Require status checks to pass
     → Pick "Build, test, smoke, docs" from the Actions dropdown.
`);
