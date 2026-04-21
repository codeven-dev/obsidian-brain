import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

// The `pipeline()` generic return type from @huggingface/transformers is a
// tagged union over every supported task, which hits TS2590 ("union type too
// complex") under strict mode. We cast through `unknown` to a minimal shape.
interface Extractor {
  (text: string, options: { pooling: 'mean'; normalize: boolean }): Promise<{
    tolist(): number[][];
  }>;
  dispose(): Promise<void>;
}

export class Embedder {
  private extractor: Extractor | null = null;

  async init(): Promise<void> {
    const p = (await pipeline('feature-extraction', MODEL, {
      dtype: 'q8',
    })) as unknown as Extractor;
    this.extractor = p;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.extractor) throw new Error('Embedder not initialized. Call init() first.');
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    return new Float32Array(output.tolist()[0] ?? []);
  }

  async dispose(): Promise<void> {
    if (this.extractor) {
      await this.extractor.dispose();
      this.extractor = null;
    }
  }

  static buildEmbeddingText(
    title: string,
    tags: string[],
    content: string,
  ): string {
    const firstParagraph = content.split(/\n\n+/)[0] ?? '';
    const parts = [title];
    if (tags.length > 0) {
      parts.push(tags.join(', '));
    }
    if (firstParagraph) {
      parts.push(firstParagraph);
    }
    return parts.join('\n');
  }
}
