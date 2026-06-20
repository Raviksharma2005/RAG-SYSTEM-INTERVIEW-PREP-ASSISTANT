/**
 * Retrieval Evaluation Script — Phase 2
 * 
 * For each query in golden_set.jsonl:
 * 1. Embed the query via Gemini
 * 2. Query Upstash Vector for top-5 results
 * 3. Check if expected chunk IDs appear in results
 * 4. Compute and log recall@5
 * 
 * Usage: npx tsx scripts/eval_retrieval.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Types ───────────────────────────────────────────────────────────
interface GoldenPair {
  query: string;
  expected_chunk_ids: string[];
}

interface EvalResult {
  query: string;
  expected: string[];
  retrieved: string[];
  hit: boolean;
  matched_ids: string[];
}

// ─── Configuration ───────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const OUTPUT_DIMENSIONALITY = 768;
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
const TOP_K = 5;

// ─── Upstash Vector Client ──────────────────────────────────────────
const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

// ─── Embed a query ──────────────────────────────────────────────────
async function embedQuery(text: string, retries = 5, delay = 2000): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(EMBEDDING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: OUTPUT_DIMENSIONALITY,
        }),
      });

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
        console.warn(`  ⚠️ Rate limit hit. Waiting ${waitTime / 1000}s before retry (attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.embedding.values;
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`  ⚠️ Attempt ${attempt} failed: ${(error as Error).message}. Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Failed to embed after retries');
}

// ─── Main Evaluation Logic ──────────────────────────────────────────
async function main() {
  console.log('🧪 Starting Retrieval Evaluation...\n');

  // 1. Load golden set
  const goldenPath = path.resolve(__dirname, '../eval/golden_set.jsonl');
  const lines = fs.readFileSync(goldenPath, 'utf-8').split('\n').filter(l => l.trim());
  const goldenPairs: GoldenPair[] = lines.map(l => JSON.parse(l));

  console.log(`📄 Loaded ${goldenPairs.length} evaluation queries\n`);

  // 2. Evaluate each query
  const results: EvalResult[] = [];
  let hits = 0;

  for (let i = 0; i < goldenPairs.length; i++) {
    const pair = goldenPairs[i];

    // Embed the query
    const queryEmbedding = await embedQuery(pair.query);

    // Query Upstash Vector for top-K
    const searchResults = await vectorIndex.query({
      vector: queryEmbedding,
      topK: TOP_K,
      includeMetadata: true,
    });

    const retrievedIds = searchResults.map(r => r.id as string);

    // Check if any expected ID appears in top-K
    const matchedIds = pair.expected_chunk_ids.filter(id => retrievedIds.includes(id));
    const hit = matchedIds.length > 0;

    if (hit) hits++;

    results.push({
      query: pair.query,
      expected: pair.expected_chunk_ids,
      retrieved: retrievedIds,
      hit,
      matched_ids: matchedIds,
    });

    const status = hit ? '✅' : '❌';
    console.log(`  ${status} [${i + 1}/${goldenPairs.length}] "${pair.query.substring(0, 60)}..."`);
    if (!hit) {
      console.log(`     Expected: ${pair.expected_chunk_ids.join(', ')}`);
      console.log(`     Got:      ${retrievedIds.join(', ')}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. Compute recall@5
  const recall = (hits / goldenPairs.length) * 100;

  console.log('\n' + '='.repeat(60));
  console.log(`📊 RECALL@${TOP_K} RESULTS`);
  console.log('='.repeat(60));
  console.log(`  Total queries:   ${goldenPairs.length}`);
  console.log(`  Hits:            ${hits}`);
  console.log(`  Misses:          ${goldenPairs.length - hits}`);
  console.log(`  Recall@${TOP_K}:       ${recall.toFixed(1)}%`);
  console.log(`  Target:          ≥ 70%`);
  console.log(`  Status:          ${recall >= 70 ? '✅ PASS' : '❌ FAIL — revise chunks'}`);
  console.log('='.repeat(60));

  // 4. Save detailed results
  const resultsPath = path.resolve(__dirname, '../eval/eval_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    embedding_model: EMBEDDING_MODEL,
    top_k: TOP_K,
    total_queries: goldenPairs.length,
    hits,
    misses: goldenPairs.length - hits,
    recall_at_5: recall,
    pass: recall >= 70,
    details: results,
  }, null, 2));
  console.log(`\n📁 Detailed results saved to: eval/eval_results.json`);

  // 5. Misses analysis
  const misses = results.filter(r => !r.hit);
  if (misses.length > 0) {
    console.log(`\n⚠️  Missed queries (${misses.length}):`);
    misses.forEach(m => {
      console.log(`  - "${m.query}"`);
      console.log(`    Expected: ${m.expected.join(', ')}`);
      console.log(`    Got:      ${m.retrieved.join(', ')}`);
    });
  }
}

main().catch(console.error);
