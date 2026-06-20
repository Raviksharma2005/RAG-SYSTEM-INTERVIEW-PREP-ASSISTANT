/**
 * Ingestion Script — Phase 2
 * 
 * Reads chunks.jsonl, embeds each chunk via Gemini Embedding API,
 * and upserts into Upstash Vector in batches of 50.
 * 
 * Usage: npx tsx scripts/ingest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Types ───────────────────────────────────────────────────────────
interface ChunkMetadata {
  domain: string;
  topic: string;
  type: string;
  difficulty: string;
  source: string;
  source_priority: number;
  embedding_model: string;
}

interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

// ─── Configuration ───────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const OUTPUT_DIMENSIONALITY = 768; // Must match Upstash Vector index dimension
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
const BATCH_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;
const BATCH_SIZE = 50;
const EMBED_BATCH_SIZE = 20; // Gemini allows up to 100, but we'll be conservative

// ─── Upstash Vector Client ──────────────────────────────────────────
const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

// ─── Embed a batch of texts using Gemini Batch API ──────────────────
async function embedBatch(texts: string[]): Promise<number[][]> {
  const requests = texts.map(text => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: OUTPUT_DIMENSIONALITY,
  }));

  const response = await fetch(BATCH_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.embeddings.map((e: any) => e.values);
}

// ─── Embed a single text (fallback) ─────────────────────────────────
async function embedSingle(text: string): Promise<number[]> {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: OUTPUT_DIMENSIONALITY,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

// ─── Main Ingestion Logic ────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting ingestion...\n');

  // 1. Read chunks.jsonl
  const chunksPath = path.resolve(__dirname, '../data/chunks.jsonl');
  const lines = fs.readFileSync(chunksPath, 'utf-8').split('\n').filter(l => l.trim());
  const chunks: Chunk[] = lines.map(l => JSON.parse(l));

  console.log(`📄 Loaded ${chunks.length} chunks from chunks.jsonl`);

  // 2. Count by domain
  const domainCounts: Record<string, number> = {};
  chunks.forEach(c => {
    domainCounts[c.metadata.domain] = (domainCounts[c.metadata.domain] || 0) + 1;
  });
  console.log('📊 Distribution:', domainCounts);

  // 3. Embed in batches
  console.log(`\n🔄 Embedding ${chunks.length} chunks in batches of ${EMBED_BATCH_SIZE}...`);
  const embeddings: number[][] = [];
  
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map(c => c.text);
    
    try {
      const batchEmbeddings = await embedBatch(texts);
      embeddings.push(...batchEmbeddings);
      console.log(`  ✅ Embedded batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / EMBED_BATCH_SIZE)} (${embeddings.length}/${chunks.length})`);
    } catch (err) {
      console.error(`  ❌ Batch embedding failed, falling back to single embedding...`);
      for (const text of texts) {
        const embedding = await embedSingle(text);
        embeddings.push(embedding);
        // Rate limit: 1 per second for single calls
        await new Promise(r => setTimeout(r, 200));
      }
      console.log(`  ✅ Fallback complete (${embeddings.length}/${chunks.length})`);
    }

    // Small delay between batches to respect rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n📐 Embedding dimension: ${embeddings[0].length}`);

  // 4. Upsert into Upstash Vector in batches
  console.log(`\n📤 Upserting ${chunks.length} vectors into Upstash in batches of ${BATCH_SIZE}...`);

  let upserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);

    const vectors = batch.map((chunk, j) => ({
      id: chunk.id,
      vector: batchEmbeddings[j],
      metadata: {
        ...chunk.metadata,
        text: chunk.text, // Store text in metadata for retrieval
      },
    }));

    await vectorIndex.upsert(vectors);
    upserted += vectors.length;
    console.log(`  ✅ Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${upserted}/${chunks.length})`);

    // Small delay between upsert batches
    await new Promise(r => setTimeout(r, 300));
  }

  // 5. Verify
  console.log('\n🔍 Verifying ingestion...');
  const info = await vectorIndex.info();
  console.log(`  Vector count: ${info.vectorCount}`);
  console.log(`  Dimension: ${info.dimension}`);

  console.log('\n✨ Ingestion complete!');
  console.log(`  Total chunks embedded and upserted: ${upserted}`);
  console.log(`  Embedding model: ${EMBEDDING_MODEL}`);
}

main().catch(console.error);
