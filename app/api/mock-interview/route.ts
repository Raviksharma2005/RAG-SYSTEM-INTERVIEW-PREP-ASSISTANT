import { NextRequest, NextResponse } from 'next/server';
import { getQueryEmbedding } from '@/lib/embeddings';
import { queryVectorDB } from '@/lib/vectordb';
import { generateText, ChatMessage } from '@/lib/llm';

/**
 * Extracts and parses a JSON object from raw LLM output, handling markdown wrapping.
 */
function extractJson(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // Attempt to extract JSON segment using regex
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (__) {}
    }
    throw new Error(`Failed to extract valid JSON grading response from LLM response: ${text}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, domain = 'all', difficulty = 'Intermediate', question, answer } = body;

    // ─────────────────────────────────────────────────────────────────
    // Action: Start Interview / Fetch Question
    // ─────────────────────────────────────────────────────────────────
    if (action === 'start') {
      // 1. Set seed query term based on domain to pull representative chunks
      const searchTerms: Record<string, string> = {
        all: 'software engineering patterns',
        DSA: 'data structures algorithm design complexity recursion tree graph binary search sorting dynamic programming',
        'System Design': 'scalability high availability caching databases sharding load balancing cap theorem microservices',
        OS: 'process synchronization scheduling memory deadlocks virtual memory thread concurrency',
        DBMS: 'acid index normalization transaction query optimization sql nosql relational database',
        CN: 'tcp udp dns osi layer handshake routing protocols network layers',
        HR: 'behavioral scenario strengths weakness communication conflict resolution tell me about yourself team',
      };

      const queryText = searchTerms[domain] || 'software engineering';
      const embed = await getQueryEmbedding(queryText);
      const retrieved = await queryVectorDB(embed, 10, domain);

      if (retrieved.length === 0) {
        return NextResponse.json(
          { error: `No chunks found for domain: ${domain}` },
          { status: 404 }
        );
      }

      // 2. Select a random subset of 3 chunks from top-10 to generate diverse questions
      const shuffled = [...retrieved].sort(() => 0.5 - Math.random());
      const selectedChunks = shuffled.slice(0, 3);
      const contextText = selectedChunks
        .map(c => `[Topic: ${c.metadata.topic}]\n${c.text}`)
        .join('\n\n');

      // 3. Prompt LLM to write a mock interview question
      const systemPrompt = `You are an elite technical interviewer conducting a mock interview.
Your goal is to generate a realistic, challenging, and clear interview question based on the provided Verified Context study material.
Domain: ${domain}
Difficulty: ${difficulty}`;

      const userPrompt = `Verified Context Study Material:
${contextText}

Generate a single mock interview question appropriate for the "${difficulty}" level.
The question should test the candidate's understanding of the topics mentioned in the context.
Return ONLY the question text itself. Do not include introductory text, numbers, formatting, options, or explanations.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const res = await generateText(messages, 0.7); // Temp 0.7 for diverse questions
      return NextResponse.json({ question: res.text.trim() });
    }

    // ─────────────────────────────────────────────────────────────────
    // Action: Submit Answer / Grade Response
    // ─────────────────────────────────────────────────────────────────
    if (action === 'submit') {
      if (!question || !answer) {
        return NextResponse.json(
          { error: 'Both question and answer parameters are required.' },
          { status: 400 }
        );
      }

      // 1. Retrieve context chunks matching the interview question
      const embed = await getQueryEmbedding(question);
      const retrieved = await queryVectorDB(embed, 3, domain);
      const contextText = retrieved
        .map(c => `[Context Topic: ${c.metadata.topic}]\n${c.text}`)
        .join('\n\n');

      // 2. Grade candidate response
      const systemPrompt = `You are a senior tech interviewer evaluating a candidate's answer to a mock interview question.
Domain: ${domain}
Difficulty: ${difficulty}

Evaluate the candidate's answer for technical accuracy, clarity, completeness, and suitability for the difficulty level.
Return your evaluation strictly in JSON format:
{
  "score": number, // integer score between 0 and 100
  "feedback": "string" // constructive Markdown feedback covering Strengths, Gaps (what was missed or incorrect), and Recommendations to improve.
}`;

      const userPrompt = `Interview Question: ${question}

Candidate's Answer:
${answer}

Verified Reference Guide Context:
${contextText}

Grade this answer and return the JSON response now. Return ONLY valid JSON.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const res = await generateText(messages, 0.1); // Temp 0.1 for consistent grading
      const grading = extractJson(res.text);

      return NextResponse.json({
        score: grading.score,
        feedback: grading.feedback,
      });
    }

    return NextResponse.json({ error: 'Invalid action parameter.' }, { status: 400 });
  } catch (error: any) {
    console.error('⚠️ Mock interview endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
