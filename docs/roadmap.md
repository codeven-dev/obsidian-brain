# Roadmap

What's shipped, what's next, what we've deliberately scoped out. Revised on each release.

*Last updated: 2026-04-22 (v1.5.8 + v1.6.0 shipped; plugin v1.6.0 alignment release.)*

## Versioning policy

Plugin and server ship aligned at **major.minor** — when server goes `X.Y.0`, plugin goes `X.Y.0` the same day (even if the plugin has no code changes, as a "version alignment" release with a CHANGELOG note). Patch versions may drift. The `capabilities[]` array in `discovery.json` remains the actual compatibility handshake; version numbers are a signal to users that "plugin 1.4.x works with server 1.4.x". The plugin jumps `0.2.1 → 1.4.0` in v1.4.0 to establish the alignment baseline.

---

## Shipped

| Release | Scope | Paired plugin |
|---|---|---|
| v1.0.0 | Core: semantic search + knowledge graph + vault editing over stdio MCP | — |
| v1.1.x | Live file watcher (chokidar) replaces scheduled reindex; offline-catchup on boot | — |
| v1.2.0 | `active_note` via companion plugin (first plugin-dependent tool) | 0.1.0 |
| v1.2.1 | Defensive hardening — per-tool timeout, SQLite WAL `busy_timeout = 5000`, embedder request serialisation | 0.1.0 |
| v1.2.2 | Theme-cache correctness, `patch_heading` `scope: 'body'`, `valueJson` for stringifying harnesses | 0.1.0 |
| v1.3.0 | `dataview_query` + capability gating via plugin discovery | 0.2.0 |
| v1.3.1 | Discriminated Dataview 424 responses (not-installed / not-enabled / api-not-ready) + doc-currency fixes | 0.2.1 |
| v1.4.0 | Retrieval-quality foundation (chunks + hybrid RRF + configurable embedder) + Bases via Path B + P0/P1 correctness fixes | 1.4.0 |
| v1.5.0 | Ollama embedder + task-type prefix factory, `next_actions` envelope + hints for search/read_note/find_connections, L1 move_note inbound link rewriting, H2/H4 disambiguation + includeStubs, I graph-analytics credibility guards (PageRank min-incoming, Louvain modularity warning, betweenness normalisation), slim npm tarball (drop `docs` from `files`) | 1.5.0 |
| v1.5.1 | BGE/E5 prefix bug fix (asymmetric models now get their required query prefix) + stratified migration via `prefix_strategy_version` metadata | 1.5.0 |
| v1.5.2 | `EMBEDDING_PRESET` named presets (`english` / `fastest` / `balanced` / `multilingual`) + default flip to `Xenova/bge-small-en-v1.5` + README honesty pass (60 MB budget, multilingual via Ollama) | 1.5.2 |
| v1.5.3–v1.5.6 | MCP Registry metadata, install snippet `@latest` defaults, README polish | 1.5.5 |
| v1.5.7 | Runtime version read via `createRequire('../package.json')` — advertised version no longer drifts from package.json | 1.5.5 |
| v1.5.8 | Stub-lifecycle fixes (`move_note` / `delete_note` / forward-refs no longer orphan stubs — backstop sweep in `reindex`), FTS5 hyphenated-query crash fix (conditional phrase-quote), hybrid+chunks metadata regression fix | 1.5.5 |
| v1.6.0 | Agentic-writes safety bundle: `dryRun` + `apply_edit_preview` (new 17th tool), bulk `edit_note` via `edits[]` (atomic), `fuzzyThreshold` on `replace_window`, `from_buffer` recovery path. `diff@^8` new runtime dep. | 1.6.0 |

---

## Next up

### v1.7.0 — block-ref editing + FTS5 frontmatter + topic-aware PageRank (~1-2 weeks)

Pairs with plugin v1.7.0.

- **`edit_note(mode: 'patch_block', block_id: '^abc123')`.** Parse `^[a-zA-Z0-9-]+$` at line end into a new `block_refs(id, node_id, start_line, end_line)` table; boundary is text from ID back to previous blank line or previous block ID. Meaningful Obsidian-power-user gap (lstpsche ships it, we don't). Adds one tool — count becomes 18.
- **FTS5 frontmatter fielding.** Tokenize frontmatter alongside title + body as a fielded index, moderate 2× boost. Complements v1.4.0's stemming + column-weighted BM25.
- **`find_influential_notes_about(topic)`.** The tool only obsidian-brain can ship because only it co-locates both signals: semantic neighborhood → induced subgraph → PageRank on the subgraph. Replaces the noisy full-vault PageRank for topic-aware "what are the hubs here". One new tool — count becomes 19.

---

## Future milestones

### v1.8.0 — graph analytics credibility writeup (~1 week)

Pairs with plugin v1.8.0 (alignment, no plugin code changes).

- **Evaluation on a real vault.** Publish top-10 PageRank results on the author's actual vault, manual hit-rate assessment, write up the methodology. Per the competitive-analysis critique: an honest 60% hit rate is more credible than silence.
- Blog post + README "how well does this work" section.
- No feature code — the work is the eval + writeup.

---

## v2.0 — daemon mode + ecosystem reach

Revisit when user demand (resource cost, install friction) actually surfaces. None of the below is committed or dated.

- **Multi-client daemon mode.** One long-running daemon + per-client stdio-proxy shims. Shared embedder + watcher + SQLite. Saves ~200 MB RAM per extra MCP client. Needs: daemon lifecycle (auto-start, health, restart), Unix socket transport (Windows: named pipe), graceful upgrade, per-client auth. Worth it only when running 3+ simultaneous MCP clients is common.
- **Community plugin registry submission.** PR `obsidian-brain-plugin` to [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) for one-click install from Obsidian's in-app Community Plugins browser (no BRAT required). Wait until the plugin's endpoint surface has stabilised (post-v1.6.0 at earliest); registry review is 1–2 weeks and re-submitting after every API change is friction.
- **Dynamic Templater-style tool registration.** If the companion plugin is installed + Templater is enabled, scan the user's templates and register each as a typed MCP tool (parsing `tp.user.askString("X")` prompts into Zod schemas). Lets "Claude, make me a meeting note" become `meeting_notes({title, attendees, date})` with validation. High ceiling, niche audience.
- **Optional git integration** for write auditing. If the vault is a git repo, each agent-initiated edit becomes a commit with attribution (`agent: claude, tool: edit_note, note: X`). Auditable + recoverable. Opt-in config flag so non-git users are unaffected.

---

## Explicitly NOT planned

Stances worth naming so expectations stay calibrated:

- **Cloud embeddings** (OpenAI, Voyage, Cohere). Deliberate local-only stance — zero egress, works offline, nothing leaves the machine. The v1.4.0 `Embedder` interface is forkable if anyone wants a cloud variant, but it won't be a first-party config knob.
- **DQL execution without Obsidian running.** Reimplementing Dataview's query engine + metadata cache outside Obsidian is months of work for no meaningful gain over the companion-plugin approach.
- **Full Bases feature parity** — rendered card / calendar / map views. MCP returns data; rendering is the client's job.
- **DataviewJS / JS-block execution.** Arbitrary JS eval against the vault is a security hole; skip permanently.
- **Plugin writes from the server** (move Obsidian's cursor, open a file in the UI, inject text into the editor). The companion plugin is read-only by design. If we ever want this, it's a separately-scoped feature with its own threat model and opt-in.
- **Rewrite in Rust.** Node + sqlite-vec + transformers.js covers the performance envelope. A Rust rewrite would cost months for no user-visible win.
- **Collapse to 5 hub-tools (aaronsb-style).** Good pattern for single-surface operations; wrong for a tool set with distinct graph-analytics + writes + search semantics. We take the `next_actions` hint pattern (v1.5.0), not the tool-count philosophy.

---

## How this list updates

- Every release bumps the "shipped" table.
- Anything in "next up" that ships moves up; anything learned during execution (scope revisions, newly-discovered risk) edits the entry in place.
- "Future milestones" items only move up into "next up" when they become the most-leveraged work. Order is defensible but not sequential — v1.7 could preempt v1.6 if block-ref editing becomes the load-bearing gap.
- Field-test feedback and user issues add entries; nothing gets added speculatively.
- Items in "NOT planned" require a documented reason to move out of that bucket.

For bug fixes and maintenance releases that don't change the roadmap shape, only the "shipped" table gets a row.
