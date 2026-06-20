'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Markdown } from '@/components/Markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  groundedness?: {
    score: number;
    isGrounded: boolean;
    ungroundedTerms: string[];
  };
  provider?: string;
  sources?: Array<{
    id: string;
    topic: string;
    source: string;
    text: string;
  }>;
}

interface Source {
  id: string;
  topic: string;
  source: string;
  text: string;
}

const DOMAINS = [
  { id: 'all', name: 'All Domains', count: 105, icon: '🌐' },
  { id: 'DSA', name: 'DSA', count: 36, icon: '🌳' },
  { id: 'System Design', name: 'System Design', count: 36, icon: '🏗️' },
  { id: 'OS', name: 'Operating Systems', count: 7, icon: '💻' },
  { id: 'DBMS', name: 'DBMS', count: 6, icon: '🗄️' },
  { id: 'CN', name: 'Computer Networks', count: 8, icon: '🔌' },
  { id: 'HR', name: 'Behavioral (HR)', count: 12, icon: '🤝' },
];

const DIFFICULTY_MODES = [
  { id: 'Beginner', label: 'Beginner', desc: 'Focus on core concepts, analogies, simple definitions.' },
  { id: 'Intermediate', label: 'Intermediate', desc: 'Standard technical terms, details, code snippets, trade-offs.' },
  { id: 'Advanced', label: 'Advanced', desc: 'Deep dive, architecture, scalability, optimizations, low-level details.' },
];

const SUGGESTIONS: Record<string, string[]> = {
  all: [
    'What is Binary Search and when should I use it?',
    'Explain horizontal vs vertical scaling.',
    'What is a deadlock in OS?',
    'How should I answer "Tell me about yourself"?',
  ],
  DSA: [
    'What is Binary Search and when should I use it?',
    'Explain the difference between arrays and linked lists.',
    'How does a Hash Table work internally?',
    'Explain Dijkstra\'s shortest path algorithm.',
  ],
  'System Design': [
    'Explain horizontal vs vertical scaling.',
    'What is the CAP Theorem?',
    'How does a CDN improve performance?',
    'Explain DB Sharding and Replication.',
  ],
  OS: [
    'What is a deadlock in OS?',
    'Explain the difference between a Process and a Thread.',
    'What is Virtual Memory?',
  ],
  DBMS: [
    'Explain ACID properties in databases.',
    'How do Database Indexes speed up queries?',
    'What is Database Normalization?',
  ],
  CN: [
    'What is the difference between TCP and UDP?',
    'How does DNS lookup work?',
    'Explain the layers of the OSI model.',
  ],
  HR: [
    'How should I answer "Tell me about yourself"?',
    'How to answer "What are your weaknesses"?',
    'How do you handle conflict in a team?',
  ],
};

export default function Home() {
  const [activeMode, setActiveMode] = useState<'chat' | 'interview'>('chat');
  const [domain, setDomain] = useState('all');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  // Mock Interview State
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [interviewMessages, setInterviewMessages] = useState<Message[]>([]);
  const [interviewScore, setInterviewScore] = useState<number | null>(null);
  const [interviewFeedback, setInterviewFeedback] = useState('');
  const [interviewLoading, setInterviewLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interviewMessages, isGenerating]);

  // Reset chat when switching mode, domain, or difficulty
  const handleDomainChange = (newDomain: string) => {
    setDomain(newDomain);
    setMessages([]);
    setInterviewStarted(false);
    setInterviewMessages([]);
    setInterviewScore(null);
    setInterviewFeedback('');
  };

  const handleDifficultyChange = (newDiff: string) => {
    setDifficulty(newDiff);
    setMessages([]);
    setInterviewStarted(false);
    setInterviewMessages([]);
    setInterviewScore(null);
    setInterviewFeedback('');
  };

  // ───────────────────────────────────────────────────────────────────
  // SSE CHAT STREAMING
  // ───────────────────────────────────────────────────────────────────
  const handleChatSubmit = async (e: React.FormEvent, customText?: string) => {
    e.preventDefault();
    const textToSend = customText || input;
    if (!textToSend.trim() || isGenerating) return;

    setInput('');
    const userMessage: Message = { role: 'user', content: textToSend };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsGenerating(true);

    // Add empty placeholder message for assistant streaming
    const assistantPlaceholder: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          domain,
          difficulty,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate response.');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No body reader found.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith('data: ')) continue;

          const dataStr = cleanLine.slice(6).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'chunk') {
              setMessages(prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.content += data.text;
                }
                return next;
              });
            } else if (data.type === 'metadata') {
              setMessages(prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.groundedness = data.groundedness;
                  lastMsg.provider = data.provider;
                  lastMsg.sources = data.sources;
                }
                return next;
              });
            } else if (data.type === 'error') {
              setMessages(prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.content = `❌ Error: ${data.message}`;
                }
                return next;
              });
            }
          } catch (parseErr) {
            console.error('SSE JSON parse error:', parseErr);
          }
        }
      }
    } catch (err: any) {
      console.error('Chat submit error:', err);
      setMessages(prev => {
        const next = [...prev];
        const lastMsg = next[next.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = `❌ Error: ${err.message || 'Failed to fetch response.'}`;
        }
        return next;
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // MOCK INTERVIEW ACTIONS
  // ───────────────────────────────────────────────────────────────────
  const startMockInterview = async () => {
    setInterviewLoading(true);
    setInterviewScore(null);
    setInterviewFeedback('');
    setInterviewMessages([]);
    setInterviewStarted(true);

    try {
      const response = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          domain,
          difficulty,
        }),
      });

      const data = await response.json();
      if (response.ok && data.question) {
        setCurrentQuestion(data.question);
        setInterviewMessages([{ role: 'assistant', content: data.question }]);
      } else {
        throw new Error(data.error || 'Failed to fetch interview question.');
      }
    } catch (err: any) {
      console.error(err);
      setInterviewMessages([
        { role: 'assistant', content: `❌ Failed to start mock interview: ${err.message}` },
      ]);
    } finally {
      setInterviewLoading(false);
    }
  };

  const handleInterviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || interviewLoading) return;

    const answerText = input;
    setInput('');
    setInterviewMessages(prev => [...prev, { role: 'user', content: answerText }]);
    setInterviewLoading(true);

    try {
      const response = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          domain,
          difficulty,
          question: currentQuestion,
          answer: answerText,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setInterviewScore(data.score);
        setInterviewFeedback(data.feedback);
        setInterviewMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `### Interview Grade & Feedback\n\n**Score: ${data.score}/100**\n\n${data.feedback}`,
          },
        ]);
      } else {
        throw new Error(data.error || 'Failed to submit answer.');
      }
    } catch (err: any) {
      console.error(err);
      setInterviewMessages(prev => [
        ...prev,
        { role: 'assistant', content: `❌ Error grading answer: ${err.message}` },
      ]);
    } finally {
      setInterviewLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100 overflow-hidden">
      {/* ─── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="w-80 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur-md flex flex-col flex-shrink-0 select-none">
        {/* Title Logo */}
        <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-zinc-100 uppercase">Interview</h1>
            <p className="text-xxs font-semibold text-zinc-400 tracking-wider uppercase">Prep Assistant</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="p-4 border-b border-zinc-800">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
            <button
              onClick={() => {
                setActiveMode('chat');
                setInterviewStarted(false);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                activeMode === 'chat'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              💬 Chat Assistant
            </button>
            <button
              onClick={() => {
                setActiveMode('interview');
                setMessages([]);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                activeMode === 'interview'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🎯 Mock Interview
            </button>
          </div>
        </div>

        {/* Domain Selection */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h2 className="text-xxs font-bold uppercase tracking-widest text-zinc-500 mb-3 pl-1">
              Select Topic Domain
            </h2>
            <div className="space-y-1">
              {DOMAINS.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleDomainChange(d.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all border text-left ${
                    domain === d.id
                      ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-200 font-semibold'
                      : 'border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-base leading-none select-none">{d.icon}</span>
                    <span>{d.name}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-950/80 text-zinc-500 font-mono text-xxs font-bold">
                    {d.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div>
            <h2 className="text-xxs font-bold uppercase tracking-widest text-zinc-500 mb-3 pl-1">
              Difficulty Mode
            </h2>
            <div className="grid grid-cols-3 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
              {DIFFICULTY_MODES.map(mode => (
                <button
                  key={mode.id}
                  title={mode.desc}
                  onClick={() => handleDifficultyChange(mode.id)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    difficulty === mode.id
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xxs text-zinc-500 px-1 italic">
              {DIFFICULTY_MODES.find(m => m.id === difficulty)?.desc}
            </p>
          </div>
        </div>

        {/* System Health Indicators */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/40 space-y-2 select-none">
          <div className="flex items-center justify-between text-xxs font-bold text-zinc-500">
            <span>DATABASE CONNECTION</span>
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ONLINE
            </span>
          </div>
          <div className="flex items-center justify-between text-xxs font-bold text-zinc-500">
            <span>API CACHE STATUS</span>
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              CONNECTED
            </span>
          </div>
        </div>
      </aside>

      {/* ─── MAIN PANEL ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
        {/* Header bar */}
        <header className="h-16 border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium text-xs">
              {DOMAINS.find(d => d.id === domain)?.name}
            </span>
            <span className="h-1 w-1 rounded-full bg-zinc-700"></span>
            <span className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium text-xs">
              {difficulty} Mode
            </span>
          </div>

          <button
            onClick={() => {
              setMessages([]);
              setInterviewMessages([]);
              setInterviewStarted(false);
              setInterviewScore(null);
              setInterviewFeedback('');
            }}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border border-zinc-800 hover:bg-zinc-800/50 hover:text-white transition-all text-zinc-400"
          >
            🧹 Clear Session
          </button>
        </header>

        {/* ─── CONTENT AREA ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {activeMode === 'chat' ? (
            /* 💬 CHAT CONVERSATION VIEW */
            messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-8">
                <div className="space-y-3">
                  <span className="text-4xl">🚀</span>
                  <h3 className="text-xl font-bold text-white">Ask your prep question</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Type a concept you wish to understand or click one of the suggested topics below to start.
                    Our engine will fetch verified documentation, evaluate groundedness, and explain it details!
                  </p>
                </div>

                <div className="w-full space-y-2">
                  <p className="text-left text-xxs font-bold uppercase tracking-wider text-zinc-500 pl-1 mb-2">
                    Quick Suggestions
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                    {(SUGGESTIONS[domain] || SUGGESTIONS.all).map((q, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => handleChatSubmit(e, q)}
                        className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 hover:bg-zinc-900/70 hover:border-zinc-700 text-xs font-medium text-zinc-300 leading-relaxed transition-all cursor-pointer text-left flex items-start justify-between gap-3 group"
                      >
                        <span>{q}</span>
                        <span className="text-zinc-500 group-hover:text-indigo-400 transition-all">➔</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {/* Speaker Header */}
                    <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 px-1 select-none">
                      {m.role === 'user' ? 'Candidate' : 'Interviewer'}
                    </span>

                    {/* Bubble body */}
                    <div
                      className={`max-w-full rounded-2xl p-5 border text-sm shadow-md transition-all ${
                        m.role === 'user'
                          ? 'bg-zinc-900/75 border-zinc-800 text-zinc-100 rounded-tr-none'
                          : 'bg-zinc-900/30 border-zinc-800/50 text-zinc-200 rounded-tl-none'
                      }`}
                    >
                      {m.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      ) : (
                        <div className="space-y-4">
                          {/* Markdown formatted response */}
                          <Markdown content={m.content} />

                          {/* Metadata and Citations footer */}
                          {(m.provider || m.groundedness || (m.sources && m.sources.length > 0)) && (
                            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-col gap-3.5">
                              {/* Provider & Groundedness */}
                              <div className="flex flex-wrap items-center justify-between gap-3 text-xxs font-bold select-none text-zinc-500">
                                <div className="flex items-center gap-3">
                                  {m.provider && (
                                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 uppercase tracking-wide">
                                      ENGINE: {m.provider}
                                    </span>
                                  )}
                                </div>

                                {m.groundedness && (
                                  <div className="flex items-center gap-2">
                                    <span>GROUNDEDNESS:</span>
                                    <span
                                      className={`px-2 py-0.5 rounded border flex items-center gap-1.5 uppercase ${
                                        m.groundedness.score >= 0.75
                                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                          : m.groundedness.score >= 0.55
                                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
                                      }`}
                                    >
                                      {m.groundedness.score >= 0.75 ? '🟢 ' : m.groundedness.score >= 0.55 ? '🟡 ' : '🔴 '}
                                      {m.groundedness.score >= 0.75
                                        ? 'HIGH CONFIDENCE'
                                        : m.groundedness.score >= 0.55
                                        ? 'MEDIUM CONFIDENCE'
                                        : 'LOW CONFIDENCE'}
                                      ({(m.groundedness.score * 100).toFixed(0)}%)
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Sources Citation List */}
                              {m.sources && m.sources.length > 0 && (
                                <div>
                                  <p className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                                    Citations & Context Sources
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {m.sources.map((s, sIdx) => (
                                      <button
                                        key={sIdx}
                                        onClick={() => setSelectedSource(s)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800 text-xxs font-semibold text-zinc-300 transition-all cursor-pointer"
                                      >
                                        📄 {s.topic} ({s.source})
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading typing skeleton */}
                {isGenerating && messages[messages.length - 1]?.content === '' && (
                  <div className="flex flex-col items-start">
                    <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-1 px-1">
                      Interviewer
                    </span>
                    <div className="rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900/30 text-zinc-400 text-sm rounded-tl-none flex items-center gap-2 select-none">
                      <span className="text-xs">Thinking and fetching sources</span>
                      <span className="flex gap-1">
                        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce delay-75"></span>
                        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce delay-150"></span>
                        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce delay-300"></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            /* 🎯 MOCK INTERVIEW MODE VIEW */
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              {!interviewStarted ? (
                <div className="my-auto flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6">
                  <span className="text-5xl select-none">🎯</span>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-white">Mock Interview Mode</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      Select a domain and difficulty, then click Start. The assistant will fetch a random question,
                      listen to your response, and grade you out of 100 with detailed architectural feedback.
                    </p>
                  </div>
                  <button
                    onClick={startMockInterview}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-95 transition-all select-none cursor-pointer"
                  >
                    🎬 Start Mock Interview
                  </button>
                </div>
              ) : (
                <div className="space-y-6 flex-1 flex flex-col">
                  {/* Interview Question Box */}
                  <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/20 backdrop-blur-sm space-y-3">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xxs font-bold select-none uppercase">
                      Active Question
                    </span>
                    <h4 className="text-base md:text-lg font-semibold text-white leading-relaxed">
                      {currentQuestion}
                    </h4>
                  </div>

                  {/* Feedback display if score is calculated */}
                  {interviewScore !== null && (
                    <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xxs font-bold select-none uppercase">
                          Grading Report
                        </span>
                        <span className="text-lg font-bold text-emerald-400">Score: {interviewScore}/100</span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {interviewFeedback}
                      </p>
                      <div className="pt-2">
                        <button
                          onClick={startMockInterview}
                          className="px-4 py-2 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-xs font-semibold text-white transition-all cursor-pointer"
                        >
                          🔄 Ask Another Question
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Interview chat message log */}
                  <div className="space-y-4 flex-1">
                    {interviewMessages.slice(1).map((m, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-1 px-1">
                          {m.role === 'user' ? 'Your Response' : 'Interviewer Evaluation'}
                        </span>
                        <div
                          className={`max-w-full rounded-2xl p-5 border text-sm shadow-md transition-all ${
                            m.role === 'user'
                              ? 'bg-zinc-900/75 border-zinc-800 text-zinc-100 rounded-tr-none'
                              : 'bg-zinc-900/30 border-zinc-850 text-zinc-200 rounded-tl-none'
                          }`}
                        >
                          <Markdown content={m.content} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Loading / Grading Indicator */}
                  {interviewLoading && (
                    <div className="flex flex-col items-start">
                      <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-1 px-1">
                        Interviewer
                      </span>
                      <div className="rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900/30 text-zinc-400 text-sm rounded-tl-none flex items-center gap-2 select-none">
                        <span>Evaluating and grading response</span>
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce delay-75"></span>
                          <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce delay-150"></span>
                          <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce delay-300"></span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ─── BOTTOM CHAT INPUT BAR ─────────────────────────────────────── */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/30 backdrop-blur-md flex-shrink-0 z-10">
          <form
            onSubmit={activeMode === 'chat' ? handleChatSubmit : handleInterviewSubmit}
            className="max-w-4xl mx-auto flex items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2.5 focus-within:border-zinc-700 transition-all"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (activeMode === 'chat') {
                    handleChatSubmit(e);
                  } else {
                    handleInterviewSubmit(e);
                  }
                }
              }}
              placeholder={
                activeMode === 'chat'
                  ? 'Ask a question about the active domain...'
                  : 'Type your detailed response to the mock question...'
              }
              rows={1}
              className="flex-1 max-h-48 min-h-[36px] bg-transparent border-0 ring-0 outline-none text-zinc-200 placeholder-zinc-500 text-sm py-1.5 px-3 resize-none font-normal"
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating || interviewLoading}
              className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center font-bold text-sm shadow-md transition-all disabled:opacity-50 disabled:bg-zinc-850 cursor-pointer disabled:cursor-not-allowed select-none"
            >
              ➔
            </button>
          </form>
          <p className="text-center text-xxs text-zinc-500 mt-2 select-none">
            {activeMode === 'chat'
              ? 'Responses are verified against system-design-primer and verified DSA/OS context chunks.'
              : 'Press Enter to submit response, Shift+Enter for newline.'}
          </p>
        </div>
      </main>

      {/* ─── CITATION SOURCE VIEWER MODAL ──────────────────────────────── */}
      {selectedSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl relative animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between select-none">
              <div>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xxs font-bold uppercase mb-1.5 inline-block">
                  Verified Documentation Chunk
                </span>
                <h3 className="text-lg font-bold text-white">{selectedSource.topic}</h3>
              </div>
              <button
                onClick={() => setSelectedSource(null)}
                className="h-8 w-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Scroll Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Chunk content details */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-1">Source Origin</h4>
                  <p className="text-sm font-semibold text-zinc-300">{selectedSource.source}</p>
                </div>
                <div>
                  <h4 className="text-xxs font-bold uppercase tracking-wider text-zinc-500 mb-1">Database Reference ID</h4>
                  <code className="text-xs bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-zinc-400 font-mono">
                    {selectedSource.id}
                  </code>
                </div>
              </div>

              {/* Exact Text Panel */}
              <div className="border border-zinc-800 rounded-2xl bg-zinc-950 p-5 space-y-3">
                <h4 className="text-xxs font-bold uppercase tracking-wider text-zinc-500 select-none">Ingested Text Segment</h4>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-normal select-text">
                  {selectedSource.text}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-zinc-800 select-none">
              <button
                onClick={() => setSelectedSource(null)}
                className="w-full py-2.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-xs font-semibold text-white transition-all cursor-pointer text-center"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
