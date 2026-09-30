'use client';

import { Check, Warning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Orb } from '@/components/orb';
import { cn } from '@/lib/utils';

export type StepStatus = 'idle' | 'active' | 'done' | 'error';

export interface PipelineStep {
  id: string;
  label: string;
  /** what this step is doing right now, or what it found */
  detail?: string;
  status: StepStatus;
  ms?: number;
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(mq.matches);
    const on = () => setR(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return r;
}

const ORB_STATE: Record<string, 'connecting' | 'working' | 'searching' | 'weaving' | 'composing'> = {
  upload: 'connecting',
  record: 'working',
  understand: 'searching',
  organise: 'weaving',
  index: 'working',
  plan: 'weaving',
  retrieve: 'searching',
  read: 'composing',
  write: 'composing',
};

/**
 * Horizontal (or vertical) step tracker. An orb shows only on the step that is really running;
 * finished steps show a check, and the result text under each step appears as soon as it is known.
 */
export function PipelineSteps({
  steps,
  direction = 'horizontal',
  className,
}: {
  steps: PipelineStep[];
  direction?: 'horizontal' | 'vertical';
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <ol
      className={cn(direction === 'horizontal' ? 'grid gap-2 sm:grid-flow-col sm:auto-cols-fr' : 'space-y-2', className)}
      aria-label="Progress"
    >
      {steps.map((s, i) => (
        <li
          key={s.id}
          aria-current={s.status === 'active' ? 'step' : undefined}
          className={cn(
            'relative min-w-0 rounded-field border px-3 py-2 transition-colors',
            s.status === 'active' && 'border-accent bg-accent-soft',
            s.status === 'done' && 'border-line bg-surface',
            s.status === 'error' && 'border-severe/50 bg-severe-soft',
            s.status === 'idle' && 'border-dashed border-line bg-transparent'
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                s.status === 'done' && 'bg-accent text-accent-ink',
                s.status === 'idle' && 'bg-surface-2 text-muted',
                s.status === 'error' && 'bg-severe text-white',
                s.status === 'active' && 'bg-transparent'
              )}
            >
              {s.status === 'done' ? (
                <Check size={12} weight="bold" />
              ) : s.status === 'error' ? (
                <Warning size={12} weight="bold" />
              ) : s.status === 'active' ? (
                <Orb state={ORB_STATE[s.id] ?? 'working'} size={20} theme="auto" paused={reduced} aria-hidden />
              ) : (
                i + 1
              )}
            </span>
            <span className={cn('min-w-0 text-[12.5px] font-medium leading-tight', s.status === 'idle' && 'text-muted')}>{s.label}</span>
          </div>
          {(s.detail || (s.status === 'done' && s.ms !== undefined)) && (
            <p className={cn('mt-1 line-clamp-3 text-xs sm:pl-7', s.status === 'error' ? 'text-severe' : 'text-muted')}>
              {s.status === 'done' && s.ms !== undefined && <span className="mr-1 font-mono tabular-nums text-ink/70">{(s.ms / 1000).toFixed(1)}s</span>}
              {s.detail}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
