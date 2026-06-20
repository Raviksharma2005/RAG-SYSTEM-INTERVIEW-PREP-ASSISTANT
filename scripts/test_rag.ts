/**
 * Phase 3 RAG Pipeline Verification Script
 * 
 * Verifies:
 * 1. Redis Cache (get/set/normalize)
 * 2. Gemini Embeddings (768-dim + rate limits)
 * 3. Upstash Vector DB (querying + filters)
 * 4. LLM Generation and Groq -> Gemini Fallback
 * 5. Groundedness Check (pass and fail cases)
 * 
 * Usage: npx tsx scripts/test_rag.ts
 */

import './loadEnv';

import { getCachedResponse, setCachedResponse } from '../lib/cache';
import { getQueryEmbedding } from '../lib/embeddings';
import { queryVectorDB } from '../lib/vectordb';
import { generateText, ChatMessage } from '../lib/llm';
import { checkGroundedness } from '../lib/groundedness';

async function runTests() {
  console.log('🧪 Starting Phase 3 RAG Pipeline Tests...\n');

  // ───────────────────────────────────────────────────────────────────
  // TEST 1: Caching
  // ───────────────────────────────────────────────────────────────────
  console.log('🔄 Test 1: Redis Caching...');
  const testQuery = 'What is Binary Search?';
  const testResponse = JSON.stringify({
    text: 'Binary search is an O(log n) algorithm.',
    metadata: {
      groundedness: { score: 1.0, isGrounded: true, ungroundedTerms: [] },
      provider: 'groq',
      sources: ['dsa_binary_search_001'],
    },
  });

  await setCachedResponse(testQuery, 'DSA', 'Beginner', testResponse, 30); // 30s TTL
  const cachedVal = (await getCachedResponse(testQuery, 'DSA', 'Beginner')) as any;

  const parsedResponse = JSON.parse(testResponse);
  const isMatch = typeof cachedVal === 'object' && cachedVal !== null &&
                  cachedVal.text === parsedResponse.text &&
                  cachedVal.metadata.provider === parsedResponse.metadata.provider;

  if (isMatch) {
    console.log('  ✅ Cache write & read successful!');
  } else {
    console.error('  ❌ Cache mismatch! Got:', cachedVal);
  }

  // ───────────────────────────────────────────────────────────────────
  // TEST 2: Embeddings
  // ───────────────────────────────────────────────────────────────────
  console.log('\n📐 Test 2: Gemini Embeddings (768-dim)...');
  try {
    const embedding = await getQueryEmbedding('Binary search complexity');
    console.log(`  ✅ Successfully generated embedding!`);
    console.log(`  ✅ Vector Dimension: ${embedding.length} (Expected: 768)`);
    if (embedding.length !== 768) {
      throw new Error(`Embedding dimension mismatch: ${embedding.length}`);
    }
  } catch (err: any) {
    console.error(`  ❌ Embedding failed: ${err.message}`);
  }

  // ───────────────────────────────────────────────────────────────────
  // TEST 3: Vector DB Querying
  // ───────────────────────────────────────────────────────────────────
  console.log('\n🔍 Test 3: Vector DB Query & Filters...');
  try {
    const queryEmbed = await getQueryEmbedding('Explain binary search');
    
    // Test with DSA filter
    const dsaResults = await queryVectorDB(queryEmbed, 3, 'DSA');
    console.log(`  ✅ Query with 'DSA' filter returned ${dsaResults.length} chunks`);
    if (dsaResults.length > 0) {
      console.log(`    Top Match ID: ${dsaResults[0].id} (Score: ${dsaResults[0].score.toFixed(3)})`);
      console.log(`    Domain: ${dsaResults[0].metadata.domain}`);
      if (dsaResults[0].metadata.domain !== 'DSA') {
        console.error('    ❌ Domain filter failed!');
      }
    }

    // Test with HR filter (should return nothing or very low relevance HR items, but definitely HR-domain only)
    const hrResults = await queryVectorDB(queryEmbed, 3, 'HR');
    console.log(`  ✅ Query with 'HR' filter returned ${hrResults.length} chunks`);
    if (hrResults.length > 0) {
      console.log(`    Top Match ID: ${hrResults[0].id} (Domain: ${hrResults[0].metadata.domain})`);
      if (hrResults[0].metadata.domain !== 'HR') {
        console.error('    ❌ Domain filter failed!');
      }
    }
  } catch (err: any) {
    console.error(`  ❌ Vector DB query failed: ${err.message}`);
  }

  // ───────────────────────────────────────────────────────────────────
  // TEST 4: LLM Generation & Fallback
  // ───────────────────────────────────────────────────────────────────
  console.log('\n🤖 Test 4: LLM Generation and Fallback...');
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: 'You are a technical assistant.' },
    { role: 'user', content: 'Provide a 1-sentence definition of recursion.' },
  ];

  // 4a. Primary LLM (Groq)
  try {
    console.log('  Running primary LLM (Groq)...');
    const res = await generateText(chatMessages);
    console.log(`  ✅ Success! Provider: ${res.provider}`);
    console.log(`  Response: "${res.text.trim()}"`);
  } catch (err: any) {
    console.error(`  ❌ Groq failed: ${err.message}`);
  }

  // 4b. Fallback LLM (Gemini) - Simulated by temporarily breaking the Groq Key
  console.log('  Breaking GROQ_API_KEY to test fallback to Gemini...');
  const originalGroqKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'gsk_invalid_key_testing_fallback_behavior_123456';
  
  try {
    const res = await generateText(chatMessages);
    console.log(`  ✅ Fallback Success! Provider: ${res.provider}`);
    console.log(`  Response: "${res.text.trim()}"`);
    if (res.provider !== 'gemini') {
      console.error('  ❌ Fallback did not use Gemini!');
    }
  } catch (err: any) {
    console.error(`  ❌ Fallback failed: ${err.message}`);
  } finally {
    process.env.GROQ_API_KEY = originalGroqKey; // Restore
  }

  // ───────────────────────────────────────────────────────────────────
  // TEST 5: Groundedness Verification
  // ───────────────────────────────────────────────────────────────────
  console.log('\n🛡️ Test 5: Groundedness Check...');
  const chunks = [
    'Binary search operates on a sorted array by repeatedly dividing the search interval in half. The time complexity is O(log n).',
    'A binary search tree (BST) is a node-based binary tree data structure where the left subtree contains only nodes with keys less than the parent node.',
  ];

  // Case A: Grounded response
  const responseA = 'Binary search works on a sorted array and splits the interval in half. Its complexity is O(log n).';
  const resultA = checkGroundedness(responseA, chunks);
  console.log(`  Case A (Grounded): score = ${resultA.score.toFixed(3)}, isGrounded = ${resultA.isGrounded}`);
  if (!resultA.isGrounded) {
    console.error('  ❌ Case A was marked ungrounded!');
  }

  // Case B: Hallucinated response
  const responseB = 'Binary search uses a depth-first search traversal on a matrix and has a space complexity of O(N^2) using memoization.';
  const resultB = checkGroundedness(responseB, chunks);
  console.log(`  Case B (Ungrounded): score = ${resultB.score.toFixed(3)}, isGrounded = ${resultB.isGrounded}`);
  console.log(`    Ungrounded terms: ${resultB.ungroundedTerms.join(', ')}`);
  if (resultB.isGrounded) {
    console.error('  ❌ Case B was marked grounded!');
  }

  console.log('\n🏁 Phase 3 Verification Complete!');
}

runTests().catch(console.error);
