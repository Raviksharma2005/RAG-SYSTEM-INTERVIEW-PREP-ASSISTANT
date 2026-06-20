import { NextRequest, NextResponse } from 'next/server';
import { getCachedResponse, setCachedResponse } from '@/lib/cache';
import { getQueryEmbedding } from '@/lib/embeddings';
import { queryVectorDB } from '@/lib/vectordb';
import { generateStream, ChatMessage } from '@/lib/llm';
import { checkGroundedness } from '@/lib/groundedness';

// Simple in-memory rate limiter to protect free-tier APIs
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now();
  const client = rateLimitMap.get(ip);

  if (!client) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (now > client.resetTime) {
    client.count = 1;
    client.resetTime = now + windowMs;
    return false;
  }

  client.count++;
  return client.count > limit;
}

export async function POST(req: NextRequest) {
  // 1. Rate Limiting Check
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { messages, domain = 'all', difficulty = 'Intermediate' } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Invalid or missing messages array.' }, { status: 400 });
    }

    const currentQuery = messages[messages.length - 1].content;
    const encoder = new TextEncoder();

    // 2. Cache Lookup
    const cachedResponse = await getCachedResponse(currentQuery, domain, difficulty);

    if (cachedResponse) {
      // Simulate streaming for a cache hit to keep the UX consistent and fast
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const parsed = typeof cachedResponse === 'string'
              ? JSON.parse(cachedResponse)
              : (cachedResponse as any);
            const { text, metadata } = parsed;

            // Stream cached response in blocks to mimic live streaming (speed: 60 chars per 10ms)
            const chunkSize = 60;
            for (let i = 0; i < text.length; i += chunkSize) {
              const substring = text.substring(i, i + chunkSize);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: substring })}\n\n`)
              );
              await new Promise(r => setTimeout(r, 10));
            }

            // Send metadata payload
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'metadata',
                  ...metadata,
                  provider: 'cache',
                })}\n\n`
              )
            );
          } catch (_) {
            // Fallback for plain text or nested caches
            const fallbackText = typeof cachedResponse === 'string'
              ? cachedResponse
              : (cachedResponse as any)?.text || JSON.stringify(cachedResponse);
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: fallbackText })}\n\n`)
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'metadata',
                  groundedness: { score: 1.0, isGrounded: true, ungroundedTerms: [] },
                  provider: 'cache',
                  sources: [],
                })}\n\n`
              )
            );
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 3. Cache Miss: Retrieve Relevant Context Chunks
    // 3a. Generate embedding for current query
    const embedding = await getQueryEmbedding(currentQuery);

    // 3b. Query vector index with optional metadata filtering
    const retrievedChunks = await queryVectorDB(embedding, 5, domain);
    const chunkTexts = retrievedChunks.map(c => c.text);

    // 3c. Formulate Prompts
    const contextText = retrievedChunks.length > 0
      ? retrievedChunks
          .map((c, i) => `[Context ${i + 1} | Topic: ${c.metadata.topic} | Source: ${c.metadata.source}]\n${c.text}`)
          .join('\n\n')
      : 'No verified documentation found for this query.';

    const historyText = messages
      .slice(0, -1)
      .map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a senior tech interviewer and expert assistant conducting a prep session.
Your task is to answer the candidate's question clearly, thoroughly, and professionally.
Domain: ${domain === 'all' ? 'General Technical' : domain}
Target Difficulty Level: ${difficulty}

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

Conversation History:
${historyText}

Candidate Question: ${currentQuery}

Provide your response below:`;

    // 4. Construct messages list for LLM call
    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(0, -1).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userPrompt },
    ];

    // 5. SSE Streaming from LLM
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponseText = '';
        let lastProvider: 'groq' | 'gemini' = 'groq';

        try {
          const generator = generateStream(llmMessages, 0.3);

          for await (const chunk of generator) {
            fullResponseText += chunk.text;
            lastProvider = chunk.provider;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk.text })}\n\n`)
            );
          }

          // 6. Groundedness validation
          const groundedness = checkGroundedness(fullResponseText, chunkTexts);

          const sources = retrievedChunks.map(c => ({
            id: c.id,
            topic: c.metadata.topic,
            source: c.metadata.source,
            text: c.text,
          }));

          const metadata = {
            groundedness,
            provider: lastProvider,
            sources,
          };

          // Send metadata chunk
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'metadata', ...metadata })}\n\n`)
          );

          // 7. Store response package in Redis Cache
          const cacheData = JSON.stringify({
            text: fullResponseText,
            metadata,
          });
          await setCachedResponse(currentQuery, domain, difficulty, cacheData);

        } catch (streamErr: any) {
          console.error('⚠️ Stream generation error:', streamErr);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: 'An error occurred during generation. Please try again.',
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('⚠️ API Error in chat route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
