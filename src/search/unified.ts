import type { DatabaseHandle } from '../store/db.js';
import { searchVector } from '../store/embeddings.js';
import { searchFullText } from '../store/fulltext.js';
import type { Embedder } from '../embeddings/embedder.js';
import type { SearchResult } from '../types.js';

export class Search {
  constructor(
    private db: DatabaseHandle,
    private embedder: Embedder,
  ) {}

  async semantic(query: string, limit = 20): Promise<SearchResult[]> {
    const queryEmbedding = await this.embedder.embed(query);
    return searchVector(this.db, queryEmbedding, limit);
  }

  fulltext(query: string, limit = 20): SearchResult[] {
    return searchFullText(this.db, query, limit);
  }
}
