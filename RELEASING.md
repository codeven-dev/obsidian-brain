# RELEASING

Local reference for cutting releases of obsidian-brain. Not part of the docs site.

---

## Before you promote

Run through this list before invoking `npm run promote`. None of these are
enforced by the script — the `preversion` hook catches the generator checks,
but catching a drift there means `npm version` has already bumped
`package.json`, which is noisier to unwind.

1. **Add a CHANGELOG entry** for the release at the top of `docs/CHANGELOG.md`.
   Format must match `## vX.Y.Z — YYYY-MM-DD — <title>` exactly — the
   `release.yml` `awk` extractor keys off this pattern (see "CHANGELOG
   conventions" below). Bullet list of user-visible changes underneath.
2. **Prune the roadmap's "Planned / In progress" section** in
   `docs/roadmap.md` if any listed items are now shipping in this release.
   The "Recently shipped" section auto-populates from the CHANGELOG on the
   next docs build — don't touch it.
3. **Confirm the generators are in sync**:
   ```bash
   npm run gen-docs -- --check
   npm run gen-tools-docs -- --check
   ```
   Both should exit 0. The `preversion` hook runs these too, but checking
   up front is cheaper than debugging a failed `npm version`.
4. **Confirm plugin version-matching**:
   ```bash
   npm run check-plugin
   ```
   Exits 0 if `../obsidian-brain-plugin/manifest.json` major.minor matches
   `./package.json`. See "Plugin version-matching" below.

---

## What `npm version patch|minor|major` does

`npm version <bump>` runs the following sequence:

1. **Bumps `package.json` version.**
2. **Fires the `version` lifecycle hook** (`scripts/sync-server-version.mjs`).
   The script reads `process.env.npm_package_version` (set by npm) and rewrites
   every `"version": "..."` field in `server.json` using a regex replacement
   (not a JSON round-trip, so compact inline formatting is preserved). It then
   runs `git add server.json` so the file is staged alongside `package.json` in
   the version commit.
3. **Creates a git commit** (`chore: vX.Y.Z`) containing `package.json` and `server.json`.
4. **Creates an annotated git tag** `vX.Y.Z`.
5. **Fires the `postversion` lifecycle hook**: `git push --follow-tags`.
   This pushes the version commit **and** the tag in a single call, which is
   what triggers `release.yml` on GitHub Actions.

All of this is driven by the two hooks in `package.json`:

```json
"version":     "node scripts/sync-server-version.mjs && git add server.json",
"postversion": "git push --follow-tags"
```

**Never run `npm version` directly on `dev`.** The `release.yml` workflow has a
main-branch guard (lines 74–82) that checks whether the tagged commit is an
ancestor of `origin/main`. If it isn't, the workflow errors out with an explicit
message and refuses to publish.

---

## How to release — one command

```bash
npm run promote          # patch bump (default)
npm run promote -- minor # minor bump
npm run promote -- major # major bump
```

`scripts/promote.mjs` performs every step in the correct order:

1. **Validates the bump type** — `patch`, `minor`, or `major`. Exits immediately
   on anything else.
2. **Asserts current branch is `dev`** — exits if you're on `main` or anywhere
   else.
3. **Asserts a clean working tree** (`git status --porcelain`) — exits if there
   are uncommitted changes.
4. **Asserts `main..dev` is non-empty** (`git log main..dev --oneline`) — exits
   with "nothing to promote" if dev has no new commits.
5. **Runs `npm run check-plugin`** if the script exists in `package.json`. If
   absent (Phase 3 adds it), skips silently. See "Plugin version-matching" below.
6. **Fetches origin**, checks out `main`, and runs `git pull --ff-only origin main`.
7. **Merges dev into main** with `git merge --ff-only dev`. If the merge cannot
   be completed as a fast-forward (main has diverged), the script fails loudly
   rather than creating a merge commit. Resolve the divergence manually before
   retrying.
8. **Runs `npm version ${bump}`** — fires the `version` and `postversion` hooks,
   creating the version commit, tag, and push to `origin/main`. This is the step
   that triggers `release.yml`.
9. **Returns to `dev`**: checks out `dev`, fast-forwards it to `main`
   (`git merge --ff-only main`), and pushes `origin dev`.
10. **Prints a summary** showing the new version, branch states, and a reminder
    that CI is now running.

Safety: the FF-only constraint means the script either succeeds cleanly or fails
without creating any partial state. If it fails at step 7 or later, `main` may
be checked out locally — return to `dev` with `git checkout dev` and investigate.

---

## Why does dev's `package.json` only bump after the release?

`npm version patch` runs on `main` (that's where the release tag lives). It
creates a commit on `main` that bumps `package.json` from e.g. `1.6.5` → `1.6.6`
and tags it `v1.6.6`. At that moment, `dev` still shows `1.6.5` — no commit on
`dev` has yet bumped the version.

The `promote` script's final step is:

```bash
git checkout dev
git merge --ff-only main
git push origin dev
```

This fast-forwards `dev` to the same commit as `main`, so `dev`'s
`package.json` now also shows `1.6.6`. If you run the release manually (see
below) instead of via `npm run promote`, **don't forget this step** — otherwise
`dev` sits one commit behind `main`, and the next `npm run promote` will fail
its `main..dev` non-empty check (because `dev` has zero commits beyond `main`).

Recovery if you already forgot:

```bash
git checkout dev
git pull origin main
git push origin dev
```

---

## Manual / fallback flow (when `promote` breaks)

If `scripts/promote.mjs` fails partway through, or you need to cut a release
without running it, here is the full sequence. **Every command matters** —
skipping the last merge-back-to-dev is the most common mistake.

```bash
git checkout main && git pull --ff-only origin main
git merge --ff-only dev
npm version patch           # bumps package.json + server.json, commits, tags, pushes
git checkout dev
git merge --ff-only main    # <— EASY TO FORGET. Without this, dev's package.json stays at the old version.
git push origin dev
```

Notes:

- Replace `patch` with `minor` or `major` as needed.
- The `npm version` step fires the `version` hook (syncs `server.json`) and
  the `postversion` hook (`git push --follow-tags`), so the commit + tag on
  `main` are pushed to origin automatically. You do not need a separate
  `git push origin main` before the `dev` merge-back.
- If `git merge --ff-only dev` fails at step 2, `main` has diverged from
  `dev` — investigate before creating the tag.
- If `git merge --ff-only main` fails at step 5, `dev` has commits that
  aren't on `main` but the version commit landed on `main` anyway. Rebase
  `dev` onto `main` (`git rebase main`), then push.

---

## What happens after the tag

Once the tag is pushed, `.github/workflows/release.yml` fires automatically.

### Main-branch guard (lines 74–82)

The first real step (after checkout) fetches `origin/main` and calls
`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`. If the tagged commit
is not on `main`, the workflow exits 1 with a clear error message and publishes
nothing.

### Version sync from tag (lines 105–117)

The workflow uses `jq` to rewrite `package.json.version` and both
`server.json.version` / `server.json.packages[0].version` from the tag name.
This means even if the files were somehow out of sync when the tag was created,
the published artifact always reflects the tag.

### npm publish (line 145)

```
npm publish --access public
```

Authentication uses **OIDC — no `NPM_TOKEN` secret**. The npmjs.com trusted
publisher is configured once under the package settings (org: `sweir1`, repo:
`obsidian-brain`, workflow: `release.yml`). See the one-time setup comment at
the top of `release.yml`.

### MCP Registry publish (lines 148–159)

Downloads `mcp-publisher` from the MCP Registry releases, authenticates via
`./mcp-publisher login github-oidc` (OIDC, no token), validates `server.json`,
then publishes.

### GitHub Release (lines 161–193)

Release notes are extracted from `docs/CHANGELOG.md` with `awk`:

```awk
/^## v/ {
  inside = ($0 ~ "^## v" ver "( |$|—)")
}
inside
```

This matches the opening `## v${VERSION}` header and captures everything up to
the next `## v` line or EOF.

**The CHANGELOG header format must match exactly:**

```markdown
## vX.Y.Z — YYYY-MM-DD — Title
```

The `awk` pattern anchors on `^## v${VERSION}` followed by a space, end-of-line,
or an em dash (`—`). A header with extra spaces, a different dash character, or
wrong capitalisation will not match, and the release gets a generic fallback note.
See "CHANGELOG conventions" below.

---

## Plugin version-matching

The companion Obsidian plugin lives at `../obsidian-brain-plugin/` (a local
sibling repo, not published on npm). The rule: **major.minor must match**.
Patch versions may drift independently (server at `1.6.3`, plugin at `1.6.1`
is fine; server at `1.7.0` with plugin at `1.6.x` is not).

Bump locations in the plugin repo:

- `manifest.json` — `"version"` field (Obsidian reads this at install time)
- `versions.json` — add a new key for the new version with the minimum Obsidian
  API version it requires

`npm run check-plugin` (added in Phase 3) reads both `./package.json` and
`../obsidian-brain-plugin/manifest.json`, compares major.minor, and exits 1
with a clear message if they differ. It exits 0 with a warning if the plugin
directory doesn't exist (normal in CI where only the server repo is checked out).

---

## HF model cache key

`release.yml` caches the Hugging Face embedding model at (line 127):

```yaml
key: hf-Xenova-bge-small-en-v1.5
restore-keys: hf-Xenova-bge-small-
```

**Only bump the `key` suffix if the default model in
`src/embeddings/presets.ts` changes.** Bumping unnecessarily causes a cold
cache miss on every release run (~60s extra download). The `restore-keys`
prefix `hf-Xenova-bge-small-` is intentionally broad so a key change still
hits a warm partial cache for bge-small variants.

---

## Env-var hand-edit

`server.json.packages[0].environmentVariables[]` is **hand-maintained**. It
is the source of truth for the MCP Registry's published manifest and for
`docs/configuration.md` (which regenerates from it via `npm run gen-docs`
once Phase 2 lands).

When adding a new environment variable:

1. Add it to `server.json` under `packages[0].environmentVariables[]`.
2. Add the corresponding read in `src/config.ts`.
3. Run `npm run gen-docs` (Phase 2) to regenerate `docs/configuration.md`.
4. Add it to the PR template checklist entry about env-var edits.

`src/config.ts` drift vs `server.json` is a known remaining edge case (a future
Zod refactor will close it). For now, the PR template checklist is the guard.

---

## Rollback

### Forgot the merge-back to `dev`

Not a rollback — just a sync. If `dev` still shows the old version after a
release, see "Why does dev's `package.json` only bump after the release?"
above. One-liner: `git checkout dev && git pull origin main && git push origin dev`.

### Tag not yet picked up by CI (fastest path)

```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

Fix the issue, then re-run `npm run promote`.

### CI already fired but npm publish failed

Delete the tag as above. No npm action needed — the package was never published.
Re-run `npm run promote` once the issue is fixed.

### npm package already published

You cannot unpublish a published npm version (npm policy: unpublish is blocked
after 72 hours, and even within 72 hours it breaks downstream caches). Instead:

```bash
npm deprecate obsidian-brain@vX.Y.Z "reason for deprecation"
```

Then release a follow-up patch (`npm run promote`) with the fix. Users on
`npx obsidian-brain@latest` will automatically get the patched version.

If the MCP Registry also published, the follow-up patch release will overwrite
`latest` there too — no manual action needed.

---

## Worktree-agent branches

Prior Claude Code Agent sessions run with `isolation: "worktree"` left two
local-only branches:

```bash
git branch -d worktree-agent-a4249980 worktree-agent-a6352c02
```

These were never pushed to `origin`. Safe to delete any time.

---

## CHANGELOG conventions

Every release gets exactly one CHANGELOG entry. Format:

```markdown
## vX.Y.Z — YYYY-MM-DD — Title

- Bullet describing user-visible change.
- Another bullet.
```

Rules:

- **One entry per release.** No "unreleased" section.
- **Header on its own line** with no trailing content after the title.
- **Separator is an em dash** (`—`, U+2014) with a space on each side — not a
  hyphen-minus (`-`) and not an en dash (`–`). The `awk` extractor in
  `release.yml` matches `( |$|—)` after the version number; using the wrong
  dash character means no release notes on GitHub.
- **Bullets, not prose paragraphs.** Short, user-facing, past-tense where
  applicable.
- **Entries in reverse chronological order** (newest at the top).

The `awk` extractor reads from the line matching `^## v${VERSION}` (space, EOF,
or em dash following) up to the next line starting with `## v` or EOF. Everything
between those boundaries becomes the GitHub Release body verbatim.
