'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Beam, Orb } from '@/components/orb';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Long-wait indicator (>2 s): a small orb plus a text label. State maps to what is really happening. */
export function Working({
  label,
  state = 'working',
}: {
  label: string;
  state?: 'working' | 'searching' | 'composing' | 'connecting' | 'weaving';
}) {
  const reduced = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted" role="status" aria-live="polite">
      <Orb state={state} size={20} theme="auto" paused={reduced} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Border beam on the element doing the work; only while `active` (>3 s waits). Respects reduced motion.
 * The children are never re-parented: the beam is an overlay that is mounted (and its code downloaded)
 * the first time `active` becomes true, so focus and typed text survive.
 */
export function ActiveBeam({
  active,
  size = 'line',
  radius = 12,
  children,
}: {
  active: boolean;
  size?: 'line' | 'md';
  radius?: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (active) setUsed(true);
  }, [active]);

  return (
    <div className="relative" style={{ borderRadius: radius }}>
      {children}
      {used && !reduced && (
        <Beam active={active} size={size} colorVariant="mono" theme="auto" strength={0.7} className="pointer-events-none absolute inset-0" style={{ borderRadius: radius }}>
          <div className="size-full" style={{ borderRadius: radius }} />
        </Beam>
      )}
    </div>
  );
}
