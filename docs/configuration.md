---
title: Configuration
description: Every environment variable obsidian-brain reads, with defaults and the common use-cases for each.
---

# Configuration

obsidian-brain is configured entirely through environment variables. Only `VAULT_PATH` is required; everything else has sensible defaults.

## Environment variables

| Variable | Required? | Default | Description |
|---|---|---|---|
| `VAULT_PATH` | **yes** | — | Absolute path to the vault (folder of `.md` files). |
| `DATA_DIR` | no | `$XDG_DATA_HOME/obsidian-brain` or `$HOME/.local/share/obsidian-brain` | Where the SQLite index + embedding cache live. |
| `EMBEDDING_PRESET` | no | `english` | Preset name: `english` (default), `fastest`, `balanced`, `multilingual`. See [Embedding model](embeddings.md) for details. Ignored when `EMBEDDING_MODEL` is set. |
| `EMBEDDING_MODEL` | no | *(resolved from preset)* | Power-user override: any transformers.js checkpoint (with `EMBEDDING_PROVIDER=transformers`) or Ollama model name (with `EMBEDDING_PROVIDER=ollama`). Takes precedence over `EMBEDDING_PRESET`. **Auto-reindex**: switching models is safe — the server stores the active model identifier + dim in the DB and rebuilds per-chunk vectors on next boot. No `--drop` required. |
| `EMBEDDING_PROVIDER` | no | `transformers` | Embedder backend. `transformers` = local transformers.js (zero setup). `ollama` = local Ollama server via `/api/embeddings`. See [Alternative provider: Ollama](embeddings.md#alternative-provider-ollama). |
| `OLLAMA_BASE_URL` | no | `http://localhost:11434` | Ollama server URL (only read when `EMBEDDING_PROVIDER=ollama`). |
| `OLLAMA_EMBEDDING_DIM` | no | unset | Declared dim for the Ollama model. Optional — if unset the server probes the model on first startup. Useful for booting offline or pinning an expected dim. |
| `OBSIDIAN_BRAIN_NO_WATCH` | no | unset | Set to `1` to disable the auto-watcher in `server` and fall back to scheduled re-indexing. |
| `OBSIDIAN_BRAIN_NO_CATCHUP` | no | unset | Set to `1` to disable the startup catchup reindex that picks up edits made while the server was down. |
| `OBSIDIAN_BRAIN_WATCH_DEBOUNCE_MS` | no | `3000` | Per-file reindex debounce for the watcher. |
| `OBSIDIAN_BRAIN_COMMUNITY_DEBOUNCE_MS` | no | `60000` | Graph-wide community-detection debounce for the watcher. |
| `OBSIDIAN_BRAIN_TOOL_TIMEOUT_MS` | no | `30000` | Per-tool-call timeout (ms). If a handler runs longer, the server returns an MCP error pointing at the log path instead of hanging. |

## Legacy aliases

`KG_VAULT_PATH` is accepted as a legacy alias for `VAULT_PATH`. New configs should use `VAULT_PATH`.
