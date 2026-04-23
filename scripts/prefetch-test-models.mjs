#!/usr/bin/env node
/**
 * Download the embedding models used by the test suite with aggressive
 * retries and file-integrity checks. Designed for CI: runs BEFORE vitest
 * so flaky HF downloads don't surface as cryptic Protobuf-parsing errors
 * inside a failing test suite.
 *
 * Contract:
 *   - Reads $TRANSFORMERS_CACHE (or falls back to the transformers.js
 *     default) so the cache directory matches what tests will read.
 *   - Downloads each model via @huggingface/transformers' own pipeline()
 *     call, so the on-disk layout is exactly what tests expect.
 *   - On corrupt-cache indicators (Protobuf parsing, Load-model failure,
 *     missing files, 0-byte ONNX files), wipes the model's cache
 *     subdirectory and retries with exponential backoff.
 *   - Exits non-zero with an actionable message if all retries fail.
 *
 * This is faster than pre-downloading via curl because it uses the same
 * network layer transformers.js uses, so any LFS / auth headers / CDN
 * quirks get exercised identically.
 */

import { existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MODELS = [
  'Xenova/all-MiniLM-L6-v2',   // default in src/embeddings/embedder.ts — used by tests that instantiate `new Embedder()` directly
  'Xenova/bge-small-en-v1.5',  // current preset default — used by factory-routed callers
];

const MAX_ATTEMPTS = 4;

const { pipeline, env: hfEnv } = await import('@huggingface/transformers');

// Honour TRANSFORMERS_CACHE / HF_HOME the same way embedder.ts does so the
// prefetch lands in the exact directory the tests will read from.
const cacheRoot =
  process.env.TRANSFORMERS_CACHE ?? process.env.HF_HOME;
if (cacheRoot) {
  hfEnv.cacheDir = cacheRoot;
}

const resolvedCacheRoot = hfEnv.cacheDir;
console.log(`[prefetch] transformers.js cache: ${resolvedCacheRoot}`);

function modelCacheDir(modelId) {
  return join(resolvedCacheRoot, modelId);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Detect obvious corruption — 0-byte ONNX weights, missing tokenizer, etc.
 * Returns true if the on-disk state looks suspect.
 */
function looksCorrupt(modelId) {
  const dir = modelCacheDir(modelId);
  if (!existsSync(dir)) return false; // no cache → not corrupt, just missing
  const onnxPath = join(dir, 'onnx', 'model_quantized.onnx');
  if (existsSync(onnxPath)) {
    const size = statSync(onnxPath).size;
    if (size === 0) {
      console.log(`[prefetch] ${modelId}: model_quantized.onnx is 0 bytes — corrupt`);
      return true;
    }
    if (size < 1024) {
      console.log(`[prefetch] ${modelId}: model_quantized.onnx is ${size} bytes (suspiciously small) — treating as corrupt`);
      return true;
    }
  }
  return false;
}

function isCorruptError(err) {
  const msg = String(err?.message ?? err);
  return (
    /Protobuf parsing failed/i.test(msg) ||
    /Load model .* failed/i.test(msg) ||
    /Invalid model file/i.test(msg) ||
    /Unable to get model file path or buffer/i.test(msg) ||
    /onnxruntime/i.test(msg)
  );
}

async function downloadOne(modelId) {
  // Proactive corruption check on any restored cache — wipe before the
  // first load attempt if the on-disk state already looks bad.
  if (looksCorrupt(modelId)) {
    const dir = modelCacheDir(modelId);
    console.log(`[prefetch] wiping pre-existing corrupt cache at ${dir}`);
    rmSync(dir, { recursive: true, force: true });
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[prefetch] ${modelId}: attempt ${attempt}/${MAX_ATTEMPTS}...`);
      const p = await pipeline('feature-extraction', modelId, { dtype: 'q8' });
      // Probe a single embedding to confirm the model actually loads end-to-end.
      const probe = await p(' ', { pooling: 'mean', normalize: true });
      const vec = probe.tolist()[0];
      if (!vec || vec.length === 0) {
        throw new Error('Embedder produced empty vector');
      }
      console.log(`[prefetch] ${modelId}: loaded + probed (dim=${vec.length})`);
      if (typeof p.dispose === 'function') await p.dispose();
      return true;
    } catch (err) {
      console.log(`[prefetch] ${modelId}: attempt ${attempt} failed: ${err?.message ?? err}`);
      if (isCorruptError(err)) {
        const dir = modelCacheDir(modelId);
        console.log(`[prefetch] wiping cache dir ${dir} before retry`);
        rmSync(dir, { recursive: true, force: true });
      }
      if (attempt === MAX_ATTEMPTS) throw err;
      const backoff = 2 ** attempt * 1000;
      console.log(`[prefetch] waiting ${backoff}ms before retry`);
      await sleep(backoff);
    }
  }
  return false;
}

let allOk = true;
for (const modelId of MODELS) {
  try {
    await downloadOne(modelId);
  } catch (err) {
    console.error(`[prefetch] FATAL: ${modelId} failed after ${MAX_ATTEMPTS} attempts: ${err?.message ?? err}`);
    allOk = false;
  }
}

if (!allOk) {
  console.error('[prefetch] One or more models could not be downloaded. Aborting.');
  process.exit(1);
}

console.log('[prefetch] All models cached and probed successfully.');
