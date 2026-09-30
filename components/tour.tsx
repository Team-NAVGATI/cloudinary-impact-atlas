'use client';

import { ArrowLeft, ArrowRight, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Button } from '@/components/ui';

export interface TourStep {
  /** CSS selector, usually [data-tour="..."]; omit for a centred card */
  target?: string;
  title: string;
  body: string;
}

const KEY = 'atlas.tour.v1';

/** Spotlight tour. Runs once on first visit (remembered in localStorage) and again on demand via `atlas:start-tour`. */
export function Tour({ steps, auto = true }: { steps: TourStep[]; auto?: boolean }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const start = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener('atlas:start-tour', start);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (auto) {
      try {
        if (!localStorage.getItem(KEY)) t = setTimeout(start, 900);
      } catch {
        /* storage blocked: skip auto start */
      }
    }
    return () => {
      window.removeEventListener('atlas:start-tour', start);
      if (t) clearTimeout(t);
    };
  }, [auto]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, 'done');
    } catch {
      /* ignore */
    }
  }, []);

  const measure = useCallback(() => {
    const sel = steps[i]?.target;
    const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setRect(el.getBoundingClientRect());
    } else setRect(null);
  }, [i, steps]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setI((n) => Math.min(steps.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, steps.length]);

  if (!open || !steps[i]) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  // Place the card below the target when there is room, otherwise above; centred when there is no target.
  const pad = 8;
  const W = 340;
  let style: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const below = rect.bottom + pad + 190 < window.innerHeight;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - W - 12));
    style = below ? { left, top: rect.bottom + pad + 6 } : { left, top: Math.max(12, rect.top - pad - 6), transform: 'translateY(-100%)' };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Product tour">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-card ring-2 ring-highlight transition-all duration-300"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(8, 14, 11, 0.62)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(8,14,11,0.62)]" />
      )}
      <div className="absolute rounded-card border border-line bg-surface p-4 shadow-xl" style={{ ...style, width: W, maxWidth: 'calc(100vw - 24px)' }}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[11px] tabular-nums text-muted">
            {i + 1} / {steps.length}
          </p>
          <button onClick={close} className="press -mr-1 -mt-1 grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="Skip tour">
            <X size={15} />
          </button>
        </div>
        <h2 className="mt-1 text-[15px] font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted text-pretty">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} className="h-8 px-2">
            <ArrowLeft size={14} /> Back
          </Button>
          <Button variant="primary" onClick={() => (last ? close() : setI((n) => n + 1))} className="h-8">
            {last ? 'Start using Atlas' : 'Next'} {!last && <ArrowRight size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TourButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('atlas:start-tour'))}
      className={className ?? 'press inline-flex h-9 items-center rounded-field border border-line bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2'}
    >
      Take the tour
    </button>
  );
}
