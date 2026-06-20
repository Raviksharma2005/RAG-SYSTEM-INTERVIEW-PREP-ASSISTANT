/**
 * Stop words list to filter out common English words from term weight calculations.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'to',
  'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don',
  'should', 'now', 'this', 'that', 'these', 'those', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do',
  'does', 'did', 'doing', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
  'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he',
  'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves'
]);

/**
 * Tokenizes text into lowercase terms, removing punctuation and filtering stop words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Keep alphanumeric, spaces, and hyphens
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

export interface GroundednessResult {
  score: number;            // Overlap score from 0.0 to 1.0
  isGrounded: boolean;      // True if score >= threshold
  ungroundedTerms: string[]; // List of significant terms not found in the context
}

/**
 * Verifies if the LLM response is grounded in the retrieved chunks using a TF-IDF weighted overlap.
 */
export function checkGroundedness(
  response: string,
  chunks: string[],
  threshold = 0.55
): GroundednessResult {
  const responseTokens = tokenize(response);
  if (responseTokens.length === 0) {
    return { score: 1.0, isGrounded: true, ungroundedTerms: [] };
  }

  // Tokenize chunks and create set for quick lookup
  const chunkTokenSets = chunks.map(c => new Set(tokenize(c)));
  const allChunkTokens = new Set(chunks.flatMap(c => tokenize(c)));

  // Calculate Inverse Document Frequency (IDF) for each response token based on chunks
  // Treating each chunk as a document
  const N = chunks.length || 1;
  const idfs: Record<string, number> = {};

  const uniqueResponseTokens = Array.from(new Set(responseTokens));
  for (const token of uniqueResponseTokens) {
    const docCount = chunkTokenSets.filter(set => set.has(token)).length;
    // Smoothed IDF formula
    idfs[token] = Math.log(1 + (N / (docCount + 0.5)));
  }

  let totalResponseWeight = 0;
  let matchedWeight = 0;
  const ungroundedTerms: string[] = [];

  for (const token of responseTokens) {
    const idf = idfs[token] || 1.0;
    totalResponseWeight += idf;

    if (allChunkTokens.has(token)) {
      matchedWeight += idf;
    } else {
      if (!ungroundedTerms.includes(token)) {
        ungroundedTerms.push(token);
      }
    }
  }

  const score = totalResponseWeight > 0 ? matchedWeight / totalResponseWeight : 0.0;
  const isGrounded = score >= threshold;

  return {
    score,
    isGrounded,
    ungroundedTerms: ungroundedTerms.slice(0, 8), // Limit to top 8 significant ungrounded words
  };
}
