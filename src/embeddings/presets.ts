/**
 * Named presets for the transformers.js embedding model.
 *
 * Precedence (resolveEmbeddingModel):
 *   1. EMBEDDING_MODEL (raw HF model id — power-user path)
 *   2. EMBEDDING_PRESET (preset name → model id)
 *   3. default: 'english' preset (Xenova/bge-small-en-v1.5)
 *
 * Every default-tier preset (english, fastest, balanced) is ≤60 MB quantized.
 * The 'multilingual' preset is explicitly over budget (~135 MB combined: 118
 * MB ONNX + 17 MB tokenizer.json) — it's the opt-in escape hatch for non-
 * English / mixed-language vaults. The E5 `query:` / `passage:` prefixes are
 * mandatory for this model and are applied automatically by
 * `getTransformersPrefix` in embedder.ts.
 */
export const EMBEDDING_PRESETS = {
  english:      { model: 'Xenova/bge-small-en-v1.5',         sizeMb:  34, lang: 'en',           symmetric: false },
  fastest:      { model: 'Xenova/paraphrase-MiniLM-L3-v2',   sizeMb:  17, lang: 'en',           symmetric: true  },
  balanced:     { model: 'Xenova/all-MiniLM-L6-v2',          sizeMb:  23, lang: 'en',           symmetric: true  },
  multilingual: { model: 'Xenova/multilingual-e5-small',     sizeMb: 135, lang: 'multilingual', symmetric: false },
} as const;

export type EmbeddingPresetName = keyof typeof EMBEDDING_PRESETS;

export function resolveEmbeddingModel(env: NodeJS.ProcessEnv): string {
  // Precedence: EMBEDDING_MODEL > EMBEDDING_PRESET > default (english)
  if (env.EMBEDDING_MODEL && env.EMBEDDING_MODEL.trim()) {
    return env.EMBEDDING_MODEL.trim();
  }
  const presetName = (env.EMBEDDING_PRESET ?? 'english').trim().toLowerCase();
  const preset = EMBEDDING_PRESETS[presetName as EmbeddingPresetName];
  if (!preset) {
    const valid = Object.keys(EMBEDDING_PRESETS).join(', ');
    throw new Error(
      `Unknown EMBEDDING_PRESET='${presetName}'. Valid presets: ${valid}. ` +
      `Or set EMBEDDING_MODEL to a specific HF model id (power-user path).`,
    );
  }
  return preset.model;
}
