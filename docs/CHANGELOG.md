---
title: Changelog
description: User-facing release notes. For full commit detail, see GitHub Releases.
---

# Changelog

User-facing release notes. For full commit-level detail see [GitHub Releases](https://github.com/sweir1/obsidian-brain/releases).

## v1.6.1 — 2026-04-23 — Multilingual preset tightening

- `EMBEDDING_PRESET=multilingual` — framing flipped: transformers.js multilingual now positioned as the one-env-var config-only path. Works end-to-end (verified: 384-dim output, cross-lingual EN↔JA cosine 0.76).
- Corrected `presets.ts` size metadata: combined download is ~135 MB (118 MB ONNX + 17 MB tokenizer.json), not 118 MB.
- `docs/embeddings.md` multilingual section rewritten — Ollama-for-multilingual demoted to "Advanced" alternative.
- Auto-GitHub-Release step added to `release.yml` — every tag now auto-creates its Release page with notes from this changelog, marked `--latest`. (Back-filled v1.5.8 + v1.6.0 manually before this shipped.)
- Docs + README + website reorg: single-source-of-truth per fact. README 773 → 121 lines; new `docs/configuration.md`, `docs/embeddings.md`, `docs/migration-aaronsb.md`, `docs/development.md`, `docs/CHANGELOG.md`. MkDocs nav reshuffled.

## v1.6.0 — 2026-04-22 — Agentic-writes safety bundle

Paired plugin: **v1.6.0**. One new MCP tool; tool count 16 → 17.

- `dryRun: true` on `edit_note`, `move_note`, `delete_note`, `link_notes` — returns a preview without writing.
- New tool `apply_edit_preview(previewId)` — commits a preview returned by `edit_note({dryRun: true})`. File-drift guarded; 5-minute TTL.
- Bulk `edits: [...]` on `edit_note` — atomic chain; error names the failing index, nothing lands on disk.
- `fuzzyThreshold: 0–1` on `replace_window` (default 0.7).
- `from_buffer: true` on `edit_note` — retries a prior `replace_window` NoMatch with `fuzzy: true, fuzzyThreshold: 0.5`.
- New runtime dep: `diff@^8` for unified-diff generation.

## v1.5.8 — 2026-04-22 — Stub-lifecycle + FTS5 + hybrid-chunks

Paired plugin: v1.5.5 (patch drift acceptable).

- Stub-lifecycle fixes: `move_note` and `delete_note` no longer orphan stubs; forward-references (`[[X]]` before `X.md` exists) auto-upgrade when the real note is created.
- FTS5 crash on hyphenated queries fixed (e.g. `foo-bar-baz`) — conditional phrase-quoting in `src/store/fts5-escape.ts`.
- `search({mode: 'hybrid', unique: 'chunks'})` now returns chunk metadata (was semantic-only).
- `reindex({})` response includes `stubsPruned: N` — migration path for upgrading users with orphan stubs in their DB.

## v1.5.7 — 2026-04-22

- Advertised version now reads from `package.json` at runtime via `createRequire`. No more drift between tag and `server.version` in `initialize`.

## v1.5.2 — 2026-04-22 — Embedding presets

Paired plugin: v1.5.2.

- New `EMBEDDING_PRESET` env var: `english` / `fastest` / `balanced` / `multilingual`.
- Default model flipped to `Xenova/bge-small-en-v1.5` (was `all-MiniLM-L6-v2`). Auto-reindex on first boot.
- README restructured: honest ≤60 MB budget, multilingual via Ollama.

## v1.5.1 — 2026-04-22

- BGE/E5 asymmetric-model prefix fix — query-side prefix is now applied (was silently dropped).
- Stratified migration via `prefix_strategy_version` metadata; BGE/E5 users get a targeted reindex on upgrade.

## v1.5.0 — 2026-04-22 — Agent UX + Ollama

Paired plugin: v1.5.0.

- Ollama embedding provider (`EMBEDDING_PROVIDER=ollama`).
- `next_actions` response envelope on `search` / `read_note` / `find_connections` / `delete_note`: `{data, context: {next_actions}}`. Clients ignoring `context` keep working.
- `move_note` rewrites all inbound wiki-links across the vault (`linksRewritten: {files, occurrences}`).
- `edit_note({mode: 'patch_heading'})` throws `MultipleMatchesError` with per-occurrence line numbers when a heading is ambiguous; `headingIndex: N` disambiguates.
- `read_note({mode: 'full'})` returns `truncated: true` when the body exceeds `maxContentLength`.
- `includeStubs: false` on `detect_themes` + `rank_notes`.
- Graph analytics credibility guards: `rank_notes(pagerank)` defaults `minIncomingLinks: 2`; low-modularity Louvain clustering surfaces a `warning`; betweenness normalised 0–1.

## v1.4.0 — 2026-04-22 — Retrieval foundation + Bases

Paired plugin: v1.4.0.

- **Chunk-level embeddings**: each note is split at markdown headings (H1–H4), oversized sections further split on paragraph / sentence boundaries; code fences and `$$…$$` LaTeX blocks preserved. SHA-256 content-hash dedup means unchanged chunks don't re-embed.
- **Hybrid RRF search** is the default: `search({query})` fuses chunk-level semantic + FTS5 full-text ranks via Reciprocal Rank Fusion.
- Pluggable `Embedder` interface; `EMBEDDING_MODEL` env var with auto-reindex on change.
- Obsidian Bases integration via companion plugin + new `base_query` tool (Path B — own YAML + expression evaluator).
- FTS5 polish: porter stemming + column-weighted BM25 (5× title vs body).

## v1.3.0 — v1.3.1 — Dataview

Paired plugin: v0.2.0 → v0.2.1.

- `dataview_query` MCP tool via companion plugin. Returns discriminated union: `table` / `list` / `task` / `calendar`.
- 30s default timeout (Dataview has no cancellation API).

## v1.2.0 — v1.2.2 — Companion plugin foundations

Paired plugin: v0.1.0.

- `active_note` tool (first plugin-dependent tool).
- Defensive hardening: per-tool timeout, SQLite WAL `busy_timeout = 5000`, embedder request serialisation.
- Theme-cache correctness; `patch_heading` `scope: 'body'`; `valueJson` for stringifying harnesses.

## v1.0.0 — v1.1.x — Foundations

- Core semantic search + knowledge graph + vault editing over stdio MCP (v1.0.0).
- Live file watcher (chokidar) + offline-catchup on boot (v1.1.x).
