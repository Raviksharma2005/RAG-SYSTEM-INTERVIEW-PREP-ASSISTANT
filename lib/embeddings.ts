const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const OUTPUT_DIMENSIONALITY = 768;
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

/**
 * Generates vector embedding for the query using Gemini API.
 * Includes timeout and exponential backoff retry for rate limits.
 */
export async function getQueryEmbedding(
  text: string,
  retries = 3,
  delay = 1000,
  timeoutMs = 5000
): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(EMBEDDING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: OUTPUT_DIMENSIONALITY,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limits (429)
      if (response.status === 429) {
        let waitTime = delay * Math.pow(2, attempt - 1);
        try {
          const errData = await response.json();
          const details = errData?.error?.details || [];
          const retryInfo = details.find((d: any) => d['@type']?.includes('RetryInfo') || d.retryDelay);
          const retryDelayStr = retryInfo?.retryDelay;
          if (retryDelayStr && retryDelayStr.endsWith('s')) {
            const seconds = parseFloat(retryDelayStr.slice(0, -1));
            waitTime = (seconds + 1) * 1000;
          }
        } catch (_) {}
        
        console.warn(`⚠️ Embedding rate limit hit. Waiting ${waitTime / 1000}s (attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.embedding.values;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const isAbort = error.name === 'AbortError';
      const msg = isAbort ? 'Request timeout' : error.message;

      if (attempt === retries) {
        throw new Error(`Failed to generate embedding after ${retries} attempts. Last error: ${msg}`);
      }
      
      console.warn(`⚠️ Embedding attempt ${attempt} failed: ${msg}. Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Failed to embed after retries');
}
