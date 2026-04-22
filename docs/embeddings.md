---
title: Embedding model
description: Pick a preset, pick a provider, or bring your own model — obsidian-brain handles the reindex automatically.
---

# Embedding model

Embeddings are what make semantic search work — obsidian-brain converts each chunk of your notes into a vector and finds the closest matches when you search. The embedder is pluggable; you pick the trade-off between size, speed, and quality via one env var.

The easiest way to pick a model is `EMBEDDING_PRESET` — set it to a preset name instead of memorising Hugging Face model paths. `EMBEDDING_MODEL` still works for any custom checkpoint (power-user path; takes precedence when set). The server records the active model (and its output dim) in the index. If you switch models the next startup detects the change, drops the old vectors, and rebuilds per-chunk embeddings against the new model — no manual `--drop` required.

## Presets

Use `EMBEDDING_PRESET` to choose a named model without memorising Hugging Face paths. The default preset is `english`, which resolves to `Xenova/bge-small-en-v1.5` (via preset `english`).

Example MCP client config with a preset:

```json
{
  "mcpServers": {
    "obsidian-brain": {
      "command": "npx",
      "args": ["-y", "obsidian-brain@latest", "server"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/vault",
        "EMBEDDING_PRESET": "multilingual"
      }
    }
  }
}
```

### Available models

| Tier | Model | Dim | Size | Notes |
|---|---|---|---|---|
| **Default (≤60 MB)** | `Xenova/bge-small-en-v1.5` | 384 | ~34 MB | Default (`english` preset). English, asymmetric. Best retrieval under budget. |
| Default-tier alt | `Xenova/paraphrase-MiniLM-L3-v2` | 384 | ~17 MB | Tiny. English, symmetric. For constrained environments. |
| Default-tier alt | `Xenova/all-MiniLM-L12-v2` | 384 | ~34 MB | English, symmetric. More depth than L6 at similar size. |
| Default-tier alt | `Xenova/jina-embeddings-v2-small-en` | 512 | ~33 MB | English, symmetric. Long-context friendly. |
| Power-user (over budget) | `Xenova/bge-base-en-v1.5` | 768 | ~110 MB | Best CPU quality, but above the default size budget. |
| **Multilingual** | *(via Ollama)* | — | — | See below — no transformers.js multilingual model fits the ≤60 MB budget. |

### Chunk-level embeddings

Embeddings are chunk-level — each note is split at markdown headings (H1–H4) and oversized sections are further split on paragraph / sentence boundaries, preserving code fences and `$$…$$` LaTeX blocks. SHA-256 content-hash dedup means unchanged chunks don't get re-embedded on incremental reindex.

The default `hybrid` search mode fuses chunk-level semantic rank and full-text BM25 rank via Reciprocal Rank Fusion (RRF), so you get both literal-token hits and concept matches out of the box.

## Multilingual / non-English vaults

Every viable multilingual embedding model is above the ≤60 MB default-tier size budget (smallest is `multilingual-e5-small` at 118 MB quantized). Rather than bundle that into the transformers.js default tier, the recommended path for non-English or mixed-language vaults is the Ollama provider:

```bash
ollama pull bge-m3              # or: nomic-embed-text, multilingual-e5-large
export EMBEDDING_PROVIDER=ollama
export EMBEDDING_MODEL=bge-m3
```

Ollama handles model storage out-of-band (not part of the npm install), so there's no bundle-size tax on Ollama-based multilingual support. `bge-m3` is a strong default — 100+ languages, dense + sparse + multi-vector heads, asymmetric query prefixing handled automatically by the Ollama task-type prefix logic.

If you need multilingual via transformers.js (e.g. you don't run Ollama), `Xenova/multilingual-e5-small` (118 MB) works — set `EMBEDDING_PRESET=multilingual` or `EMBEDDING_MODEL=Xenova/multilingual-e5-small`. Expect a one-time 118 MB download and a slower first-boot index. This is not the default tier.

Rough speed numbers (single M1/M2 Mac, CPU-only, per chunk):

| Preset | Approx. embed latency | 3k-note vault initial index | Model download |
|---|---|---|---|
| `fastest` / `balanced` / `english` | ~30–60 ms / chunk | ~10–20 min | 17–34 MB, under a minute |
| `multilingual` | ~60–150 ms / chunk | ~30–50 min | 118 MB, 1–3 min on 10 Mbps |

Incremental reindex (post-initial) is imperceptibly different between presets because of SHA-256 content-hash dedup — only newly changed chunks get re-embedded.

## Alternative provider: Ollama

Set `EMBEDDING_PROVIDER=ollama` to route every embed through a local [Ollama](https://ollama.com) server instead of transformers.js. Useful if you already run Ollama for LLMs and want to reuse its (usually higher-quality) embedding models.

| Provider | Best for | Quality | Setup |
|---|---|---|---|
| `transformers` (default) | Any machine, offline, zero setup | Good → Very Good | None |
| `ollama` | Users already running Ollama | Excellent (`nomic-embed-text`, `bge-large`, `mxbai-embed-large`) | Install Ollama + `ollama pull <model>` |

Minimal Ollama setup:

```bash
ollama pull nomic-embed-text         # or mxbai-embed-large, bge-large, etc.
export EMBEDDING_PROVIDER=ollama
export EMBEDDING_MODEL=nomic-embed-text
# Optional — skip the startup probe by declaring the dim up front:
export OLLAMA_EMBEDDING_DIM=768
```

Well-known dims: `nomic-embed-text` = 768, `mxbai-embed-large` = 1024, `bge-large` = 1024, `qwen3-embedding-8b` = 4096. If `OLLAMA_EMBEDDING_DIM` is unset the server probes the model on first startup.

The factory applies task-type prefixes automatically for asymmetric models — `nomic-embed-text` gets `search_query: ` / `search_document: `; `qwen*` embeddings get `Query: ` on the query side; `mxbai-embed-large` / `mixedbread*` get `Represent this sentence for searching relevant passages: ` on queries. No user action needed.

Switching provider (or model) triggers an auto-reindex on next boot — the server stores `ollama:<model>` in the index and rebuilds per-chunk embeddings against the new identifier. No `--drop` required.
