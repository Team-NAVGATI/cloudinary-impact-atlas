'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders an answer with clickable citation chips. Loaded lazily by the Ask screen, only once an answer exists. */
export default function AnswerMarkdown({ markdown, onJump }: { markdown: string; onJump: (n: number) => void }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children }) {
          const m = href?.match(/^#ev-(\d+)$/);
          if (m) {
            return (
              <button
                onClick={() => onJump(Number(m[1]))}
                className="press mx-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded bg-accent-soft px-1 align-text-top font-mono text-[11px] font-semibold text-accent no-underline hover:bg-accent hover:text-accent-ink"
                aria-label={`Show source ${m[1]}`}
              >
                {m[1]}
              </button>
            );
          }
          return <a href={href}>{children}</a>;
        },
      }}
    >
      {markdown.replace(/\[(\d{1,2})\]/g, '[$1](#ev-$1)')}
    </ReactMarkdown>
  );
}
