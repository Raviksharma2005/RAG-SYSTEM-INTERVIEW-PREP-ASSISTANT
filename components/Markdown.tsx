import React from 'react';

interface MarkdownProps {
  content: string;
}

/**
 * Custom, zero-dependency Markdown parser that handles headings, lists, code blocks,
 * inline code, and bold text. Operates line-by-line to prevent layout collapse
 * when processing streamed text.
 */
export function Markdown({ content }: MarkdownProps) {
  if (!content) return null;

  // Split by triple backticks. Odd indices in this split are guaranteed to be code blocks.
  const parts = content.split('```');

  return (
    <div className="space-y-4 text-zinc-700 dark:text-zinc-300 leading-relaxed text-sm md:text-base font-normal">
      {parts.map((part, index) => {
        const isCodeBlock = index % 2 !== 0;

        if (isCodeBlock) {
          // Extract language and code content from the block
          const firstNewline = part.indexOf('\n');
          let lang = '';
          let code = part;

          if (firstNewline !== -1) {
            lang = part.substring(0, firstNewline).trim();
            code = part.substring(firstNewline + 1);
          } else {
            // Still streaming the language tag
            lang = part.trim();
            code = '';
          }

          const codeLines = code.split('\n');
          // Remove trailing empty line if it exists
          if (codeLines.length > 1 && codeLines[codeLines.length - 1] === '') {
            codeLines.pop();
          }

          return (
            <div 
              key={index} 
              className="my-4 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 shadow-md font-mono"
            >
              {/* Code Header Bar */}
              <div className="bg-zinc-50 dark:bg-zinc-900/60 px-4 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center select-none">
                <span className="font-semibold">{lang ? lang.toUpperCase() : 'CODE'}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(code.trim())}
                  className="hover:text-zinc-300 text-xxs font-bold uppercase transition-all cursor-pointer active:scale-95 py-0.5 px-2 bg-zinc-200 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                >
                  📋 Copy Code
                </button>
              </div>

              {/* Code Block with Line Numbers */}
              <div className="overflow-x-auto p-4 font-mono text-xs md:text-sm leading-relaxed scrollbar-thin">
                <table className="w-full border-collapse">
                  <tbody>
                    {codeLines.map((line, lineIdx) => (
                      <tr key={lineIdx} className="hover:bg-zinc-900/40">
                        {/* Line number cell (non-selectable) */}
                        <td className="select-none text-right pr-4 text-zinc-600 font-mono text-xxs md:text-xs border-r border-zinc-800/80 w-8 min-w-[2rem]">
                          {lineIdx + 1}
                        </td>
                        {/* Code line content cell */}
                        <td className="pl-4 text-zinc-200 whitespace-pre font-mono text-left">
                          {line || ' '}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else {
          // Parse lines in non-code text blocks
          const lines = part.split('\n');
          const elements: React.ReactNode[] = [];
          
          let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
          let currentQuote: string[] = [];

          const flushList = (key: string) => {
            if (!currentList) return;
            const ListTag = currentList.type;
            const listClass = currentList.type === 'ul' 
              ? 'list-disc pl-6 my-3 space-y-1.5 text-zinc-700 dark:text-zinc-300' 
              : 'list-decimal pl-6 my-3 space-y-1.5 text-zinc-700 dark:text-zinc-300';
            
            elements.push(
              <ListTag key={`list-${key}`} className={listClass}>
                {currentList.items.map((item, idx) => (
                  <li key={idx}>{renderInline(item)}</li>
                ))}
              </ListTag>
            );
            currentList = null;
          };

          const flushQuote = (key: string) => {
            if (currentQuote.length === 0) return;
            elements.push(
              <blockquote key={`quote-${key}`} className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 py-1.5 italic my-3 text-zinc-550 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30 rounded-r-md whitespace-pre-wrap">
                {renderInline(currentQuote.join('\n'))}
              </blockquote>
            );
            currentQuote = [];
          };

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // End structures on empty lines
            if (trimmedLine === '') {
              flushList(`${index}-${i}`);
              flushQuote(`${index}-${i}`);
              continue;
            }

            // Headers
            if (trimmedLine.startsWith('# ')) {
              flushList(`${index}-${i}`);
              flushQuote(`${index}-${i}`);
              elements.push(
                <h1 key={`h1-${index}-${i}`} className="text-2xl font-bold text-zinc-900 dark:text-white mt-5 mb-3 leading-8">
                  {renderInline(trimmedLine.slice(2))}
                </h1>
              );
              continue;
            }
            if (trimmedLine.startsWith('## ')) {
              flushList(`${index}-${i}`);
              flushQuote(`${index}-${i}`);
              elements.push(
                <h2 key={`h2-${index}-${i}`} className="text-xl font-bold text-zinc-900 dark:text-white mt-4 mb-2 leading-7">
                  {renderInline(trimmedLine.slice(3))}
                </h2>
              );
              continue;
            }
            if (trimmedLine.startsWith('### ')) {
              flushList(`${index}-${i}`);
              flushQuote(`${index}-${i}`);
              elements.push(
                <h3 key={`h3-${index}-${i}`} className="text-lg font-bold text-zinc-900 dark:text-white mt-3 mb-1.5 leading-6">
                  {renderInline(trimmedLine.slice(4))}
                </h3>
              );
              continue;
            }

            // Blockquotes
            if (trimmedLine.startsWith('> ')) {
              flushList(`${index}-${i}`);
              currentQuote.push(trimmedLine.slice(2));
              continue;
            }

            // Bullet list items starting with '-' or '*'
            const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)/);
            if (bulletMatch) {
              flushQuote(`${index}-${i}`);
              const itemContent = bulletMatch[3];
              if (currentList && currentList.type === 'ul') {
                currentList.items.push(itemContent);
              } else {
                flushList(`${index}-${i}`);
                currentList = { type: 'ul', items: [itemContent] };
              }
              continue;
            }

            // Numbered list items starting with '1.' or similar
            const numberMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
            if (numberMatch) {
              flushQuote(`${index}-${i}`);
              const itemContent = numberMatch[3];
              if (currentList && currentList.type === 'ol') {
                currentList.items.push(itemContent);
              } else {
                flushList(`${index}-${i}`);
                currentList = { type: 'ol', items: [itemContent] };
              }
              continue;
            }

            // Regular paragraph line
            flushList(`${index}-${i}`);
            flushQuote(`${index}-${i}`);
            elements.push(
              <p key={`p-${index}-${i}`} className="mb-2 whitespace-pre-wrap">
                {renderInline(line)}
              </p>
            );
          }

          // Flush any final open structures
          flushList(`${index}-final`);
          flushQuote(`${index}-final`);

          return <React.Fragment key={index}>{elements}</React.Fragment>;
        }
      })}
    </div>
  );
}

/**
 * Helper to render inline elements (bolding and backtick code snippets).
 */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-zinc-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-mono text-xs md:text-sm font-semibold">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
