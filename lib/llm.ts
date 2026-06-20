import { Groq } from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const groq = new Groq({ apiKey: GROQ_API_KEY || '' });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');

const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'gemini-2.5-flash';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  text: string;
  provider: 'groq' | 'gemini';
}

/**
 * Extracts the system prompt from the messages array.
 * Gemini handles system instructions as a separate config parameter.
 */
function extractSystemPrompt(messages: ChatMessage[]): {
  systemPrompt?: string;
  chatMessages: ChatMessage[];
} {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');
  return {
    systemPrompt: systemMsg?.content,
    chatMessages,
  };
}

/**
 * Formats standard messages to the structure expected by Gemini (role: 'user' | 'model').
 */
function formatForGemini(messages: ChatMessage[]) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

/**
 * Generates text using the primary model (Groq Llama 3.3), falling back to Gemini
 * if any error or quota issue occurs.
 */
export async function generateText(
  messages: ChatMessage[],
  temperature = 0.3
): Promise<LLMResponse> {
  const currentGroqKey = process.env.GROQ_API_KEY;
  // 1. Try Groq
  if (currentGroqKey && !currentGroqKey.startsWith('gsk_invalid')) {
    try {
      const dynamicGroq = new Groq({ apiKey: currentGroqKey });
      const response = await dynamicGroq.chat.completions.create({
        messages,
        model: PRIMARY_MODEL,
        temperature,
        max_tokens: 2048,
      });
      const text = response.choices[0]?.message?.content || '';
      return { text, provider: 'groq' };
    } catch (error: any) {
      console.warn(`⚠️ Primary LLM (Groq) failed: ${error.message}. Falling back to Gemini...`);
    }
  } else {
    console.warn('⚠️ Groq API key is invalid or not defined. Falling back to Gemini...');
  }

  // 2. Fallback to Gemini
  if (!GEMINI_API_KEY) {
    throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is defined.');
  }

  const { systemPrompt, chatMessages } = extractSystemPrompt(messages);
  const model = genAI.getGenerativeModel({
    model: FALLBACK_MODEL,
    systemInstruction: systemPrompt,
  });

  const geminiMessages = formatForGemini(chatMessages);
  
  const response = await model.generateContent({
    contents: geminiMessages,
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
    },
  });

  const text = response.response.text();
  return { text, provider: 'gemini' };
}

/**
 * Generates a streaming response. Falls back to Gemini if Groq fails before the stream starts.
 */
export async function* generateStream(
  messages: ChatMessage[],
  temperature = 0.3
): AsyncGenerator<{ text: string; provider: 'groq' | 'gemini' }> {
  const currentGroqKey = process.env.GROQ_API_KEY;
  let useGroq = !!currentGroqKey && !currentGroqKey.startsWith('gsk_invalid');

  if (useGroq) {
    try {
      const dynamicGroq = new Groq({ apiKey: currentGroqKey! });
      const responseStream = await dynamicGroq.chat.completions.create({
        messages,
        model: PRIMARY_MODEL,
        temperature,
        max_tokens: 2048,
        stream: true,
      });

      for await (const chunk of responseStream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          yield { text, provider: 'groq' };
        }
      }
      return; // Stream finished successfully
    } catch (error: any) {
      console.warn(`⚠️ Primary LLM stream (Groq) failed before starting: ${error.message}. Falling back to Gemini...`);
      useGroq = false;
    }
  }

  // Fallback to Gemini Stream
  if (!GEMINI_API_KEY) {
    throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is defined.');
  }

  const { systemPrompt, chatMessages } = extractSystemPrompt(messages);
  const model = genAI.getGenerativeModel({
    model: FALLBACK_MODEL,
    systemInstruction: systemPrompt,
  });

  const geminiMessages = formatForGemini(chatMessages);
  const responseStream = await model.generateContentStream({
    contents: geminiMessages,
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
    },
  });

  for await (const chunk of responseStream.stream) {
    const text = chunk.text();
    if (text) {
      yield { text, provider: 'gemini' };
    }
  }
}
