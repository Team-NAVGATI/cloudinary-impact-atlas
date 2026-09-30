'use client';

import Link from 'next/link';
import { CheckCircle, Circle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface Progress {
  uploaded: boolean;
  analysed: boolean;
  compared: boolean;
  reported: boolean;
  sent: boolean;
}

const STEPS = (p: Progress, asked: boolean) => [
  { label: 'Add evidence', hint: 'Drop a photo in the Studio', href: '/studio', done: p.uploaded },
  { label: 'Watch it get organised', hint: 'AI reads, files and indexes it', href: '/library', done: p.analysed },
  { label: 'Ask a question', hint: 'Plain language, answers cite sources', href: '/ask', done: asked },
  { label: 'Compare before and after', hint: 'Slide between two photos', href: '/compare', done: p.compared },
  { label: 'Generate a report', hint: 'Designed, printable, traceable', href: '/reports', done: p.reported },
  { label: 'Send it to someone', hint: 'Private link or email', href: '/reports', done: p.sent },
];

/** Progress pill + dropdown checklist. "Done" comes from real data, except Ask which is remembered locally. */
export function GetStarted({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setAsked(localStorage.getItem('atlas.asked') === '1');
    } catch {
      /* ignore */
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const steps = STEPS(progress, asked);
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="relative" ref={ref} data-tour="checklist">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press inline-flex h-9 items-center gap-2 rounded-field border border-line bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2"
      >
        <span className="relative grid size-5 place-items-center" aria-hidden>
          <svg viewBox="0 0 20 20" className="size-5 -rotate-90">
            <circle cx="10" cy="10" r="8" fill="none" stroke="var(--line)" strokeWidth="2.5" />
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${(done / steps.length) * 50.3} 50.3`}
            />
          </svg>
        </span>
        Get started {done}/{steps.length}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[320px] rounded-card border border-line bg-surface p-2 shadow-xl">
          <ul>
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} onClick={() => setOpen(false)} className="press flex items-start gap-3 rounded-field px-2.5 py-2 hover:bg-surface-2">
                  {s.done ? <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-accent" /> : <Circle size={18} className="mt-0.5 shrink-0 text-muted" />}
                  <span>
                    <span className={cn('block text-[13px] font-medium', s.done && 'text-muted line-through')}>{s.label}</span>
                    <span className="block text-xs text-muted">{s.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/guide" className="mt-1 block rounded-field px-2.5 py-2 text-[13px] text-accent underline">
            Read the full guide
          </Link>
        </div>
      )}
    </div>
  );
}
