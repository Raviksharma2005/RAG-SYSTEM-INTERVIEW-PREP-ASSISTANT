/**
 * Free-Tier Service Quota & Connectivity Validation Script
 * 
 * Checks:
 * 1. Upstash Vector DB
 * 2. Upstash Redis Cache
 * 3. Groq LLM API
 * 4. Google AI Studio Gemini API
 * 
 * Usage: npx tsx scripts/check_quotas.ts
 */

import './loadEnv';
import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';
import { Groq } from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function main() {
  console.log('🩺 Running Service Quota & Connectivity Checks...\n');

  // ───────────────────────────────────────────────────────────────────
  // 1. Upstash Vector DB
  // ───────────────────────────────────────────────────────────────────
  try {
    const vectorIndex = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const info = await vectorIndex.info();
    console.log('✅ Upstash Vector DB: ONLINE');
    console.log(`   - Vector Count: ${info.vectorCount}`);
    console.log(`   - Index Dimension: ${info.dimension}`);
  } catch (err: any) {
    console.error('❌ Upstash Vector DB Check Failed:', err.message);
  }

  // ───────────────────────────────────────────────────────────────────
  // 2. Upstash Redis Cache
  // ───────────────────────────────────────────────────────────────────
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    const pong = await redis.ping();
    console.log('✅ Upstash Redis Cache: ONLINE');
    console.log(`   - Ping Response: ${pong}`);
  } catch (err: any) {
    console.error('❌ Upstash Redis Cache Check Failed:', err.message);
  }

  // ───────────────────────────────────────────────────────────────────
  // 3. Groq LLM API
  // ───────────────────────────────────────────────────────────────────
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const start = Date.now();
    await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Ping' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 5,
    });
    const duration = Date.now() - start;
    console.log(`✅ Groq LLM API: ONLINE (Latency: ${duration}ms)`);
    console.log(`   - Active Model: llama-3.3-70b-versatile`);
  } catch (err: any) {
    console.error('❌ Groq LLM API Check Failed:', err.message);
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. Gemini Fallback LLM API
  // ───────────────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const start = Date.now();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    await model.generateContent('Ping');
    const duration = Date.now() - start;
    console.log(`✅ Gemini LLM API: ONLINE (Latency: ${duration}ms)`);
    console.log(`   - Active Fallback Model: gemini-2.5-flash`);
  } catch (err: any) {
    console.error('❌ Gemini LLM API Check Failed:', err.message);
  }

  console.log('\n🏁 Health check completed!');
}

main().catch(console.error);
