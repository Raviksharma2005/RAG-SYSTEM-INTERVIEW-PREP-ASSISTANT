import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Normalizes query string for uniform caching (lowercase, trimmed, clean spaces, no punctuation).
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Gets a cached response from Redis.
 */
export async function getCachedResponse(
  query: string,
  domain: string,
  difficulty: string
): Promise<string | null> {
  try {
    const key = `rag_cache:${domain.toLowerCase()}:${difficulty.toLowerCase()}:${normalizeQuery(query)}`;
    return await redis.get<string>(key);
  } catch (err) {
    console.error('⚠️ Redis cache get error:', err);
    return null;
  }
}

/**
 * Caches a response in Redis with an optional TTL (defaults to 24 hours).
 */
export async function setCachedResponse(
  query: string,
  domain: string,
  difficulty: string,
  response: string,
  exSeconds = 86400 // 24 hours
): Promise<void> {
  try {
    const key = `rag_cache:${domain.toLowerCase()}:${difficulty.toLowerCase()}:${normalizeQuery(query)}`;
    await redis.set(key, response, { ex: exSeconds });
  } catch (err) {
    console.error('⚠️ Redis cache set error:', err);
  }
}
