import { Index } from '@upstash/vector';

export interface RetrievedChunk {
  id: string;
  score: number;
  text: string;
  metadata: {
    domain: string;
    topic: string;
    type: string;
    difficulty: string;
    source: string;
    source_priority: number;
  };
}

// Initialize Upstash Vector Index
const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

/**
 * Queries the Upstash Vector Database with optional domain filtering.
 */
export async function queryVectorDB(
  embedding: number[],
  topK = 5,
  domainFilter?: string
): Promise<RetrievedChunk[]> {
  try {
    // Generate filter string for Upstash (e.g. domain = 'DSA')
    let filter = '';
    if (domainFilter && domainFilter.trim() !== '' && domainFilter.toLowerCase() !== 'all') {
      filter = `domain = '${domainFilter.trim()}'`;
    }

    const queryParams: any = {
      vector: embedding,
      topK,
      includeMetadata: true,
    };

    if (filter) {
      queryParams.filter = filter;
    }

    const results = await vectorIndex.query(queryParams);

    return results.map(r => ({
      id: r.id as string,
      score: r.score,
      text: (r.metadata as any)?.text || '',
      metadata: {
        domain: (r.metadata as any)?.domain || '',
        topic: (r.metadata as any)?.topic || '',
        type: (r.metadata as any)?.type || '',
        difficulty: (r.metadata as any)?.difficulty || '',
        source: (r.metadata as any)?.source || '',
        source_priority: Number((r.metadata as any)?.source_priority || 0),
      },
    }));
  } catch (err) {
    console.error('⚠️ Upstash Vector query error:', err);
    throw err;
  }
}
