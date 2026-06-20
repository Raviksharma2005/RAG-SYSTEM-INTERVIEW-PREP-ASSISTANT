/**
 * Cache Prewarming Script — Phase 6
 * 
 * Generates and stores RAG responses for all 15 suggested demo questions.
 * This guarantees instant, quota-safe responses during demonstrations.
 * 
 * Usage: npx tsx scripts/prewarm_cache.ts
 */

import './loadEnv';
import { getQueryEmbedding } from '../lib/embeddings';
import { queryVectorDB } from '../lib/vectordb';
import { generateText } from '../lib/llm';
import { checkGroundedness } from '../lib/groundedness';
import { setCachedResponse } from '../lib/cache';

const PREWARM_QUERIES = [
  // DSA
  { query: 'What is Binary Search and when should I use it?', domain: 'DSA', difficulty: 'Intermediate' },
  { query: 'Explain the difference between arrays and linked lists.', domain: 'DSA', difficulty: 'Intermediate' },
  { query: 'How does a Hash Table work internally?', domain: 'DSA', difficulty: 'Intermediate' },
  // System Design
  { query: 'Explain horizontal vs vertical scaling.', domain: 'System Design', difficulty: 'Intermediate' },
  { query: 'What is the CAP Theorem?', domain: 'System Design', difficulty: 'Intermediate' },
  { query: 'How does a CDN improve performance?', domain: 'System Design', difficulty: 'Intermediate' },
  // OS
  { query: 'What is a deadlock in OS?', domain: 'OS', difficulty: 'Intermediate' },
  { query: 'Explain the difference between a Process and a Thread.', domain: 'OS', difficulty: 'Intermediate' },
  { query: 'What is Virtual Memory?', domain: 'OS', difficulty: 'Intermediate' },
  // DBMS
  { query: 'Explain ACID properties in databases.', domain: 'DBMS', difficulty: 'Intermediate' },
  { query: 'How do Database Indexes speed up queries?', domain: 'DBMS', difficulty: 'Intermediate' },
  { query: 'What is Database Normalization?', domain: 'DBMS', difficulty: 'Intermediate' },
  // HR
  { query: 'How should I answer "Tell me about yourself"?', domain: 'HR', difficulty: 'Intermediate' },
  { query: 'How to answer "What are your weaknesses"?', domain: 'HR', difficulty: 'Intermediate' },
  { query: 'How do you handle conflict in a team?', domain: 'HR', difficulty: 'Intermediate' }
];

async function prewarm() {
  console.log(`🔥 Prewarming Redis Cache for ${PREWARM_QUERIES.length} standard questions...\n`);

  for (let i = 0; i < PREWARM_QUERIES.length; i++) {
    const item = PREWARM_QUERIES[i];
    console.log(`🔄 [${i + 1}/${PREWARM_QUERIES.length}] Processing: "${item.query}" (${item.domain})`);

    try {
      // 1. Embed query
      const embedding = await getQueryEmbedding(item.query);

      // 2. Query Vector DB
      const chunks = await queryVectorDB(embedding, 5, item.domain);
      const chunkTexts = chunks.map(c => c.text);

      const contextText = chunks.length > 0
        ? chunks.map((c, idx) => `[Context ${idx + 1} | Topic: ${c.metadata.topic}]\n${c.text}`).join('\n\n')
        : 'No verified context found.';

      // 3. Build prompts
      const systemPrompt = `You are a senior tech interviewer and expert assistant conducting a prep session.
Your task is to answer the candidate's question clearly, thoroughly, and professionally.
Domain: ${item.domain}
Target Difficulty Level: ${item.difficulty}

Adjust your explanation depth and complexity according to the Target Difficulty Level:
- Beginner: Focus on core concepts, clear analogies, simple code/explanations, and avoid unnecessary jargon.
- Intermediate: Provide technical details, clear structure, common trade-offs, and practical code snippets.
- Advanced: Deep dive into architectural patterns, low-level optimization, edge cases, scalability concerns, and complex senior-level trade-offs.

Guidelines:
1. Maintain a professional, constructive, and encouraging interviewer tone.
2. Base your response primarily on the provided Verified Context below.
3. If the context does not contain sufficient details to answer, use your general knowledge, but you MUST prepend a short disclaimer (e.g. "[General Knowledge] ...") to indicate that these details were not present in the verified documentation.
4. Format your answer beautifully using Markdown (headers, bullet points, bolding, and formatted code blocks).`;

      const userPrompt = `Verified Context:
${contextText}

Candidate Question: ${item.query}

Provide your response below:`;

      // 4. Generate answer via LLM (Groq with Gemini fallback)
      const llmRes = await generateText([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 0.3);

      // 5. Evaluate groundedness
      const groundedness = checkGroundedness(llmRes.text, chunkTexts);

      const sources = chunks.map(c => ({
        id: c.id,
        topic: c.metadata.topic,
        source: c.metadata.source,
        text: c.text
      }));

      const metadata = {
        groundedness,
        provider: llmRes.provider,
        sources,
      };

      // 6. Cache Response
      const cacheData = JSON.stringify({
        text: llmRes.text,
        metadata,
      });

      await setCachedResponse(item.query, item.domain, item.difficulty, cacheData);
      console.log(`   ✅ Cache Loaded! Provider: ${llmRes.provider}, Groundedness: ${(groundedness.score * 100).toFixed(0)}%`);

      // Rate limit sleep
      await new Promise(r => setTimeout(r, 1200));
    } catch (err: any) {
      console.error(`   ❌ Prewarm Failed:`, err.message);
    }
  }

  console.log('\n✨ Prewarming Cache Complete!');
}

prewarm().catch(console.error);
