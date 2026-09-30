'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Beam } from '@/components/orb';

/**
 * The single highlighted action on the landing page: a pulsing border beam on the primary CTA.
 * The link renders instantly; the beam (a separate code-split chunk) is layered on after the page is idle,
 * so it never delays first paint.
 */
export function HeroCta() {
  const [beam, setBeam] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(() => setBeam(true)) : window.setTimeout(() => setBeam(true), 800);
    return () => {
      if (!idle) window.clearTimeout(id);
    };
  }, []);

  return (
    <span className="relative inline-block rounded-[8px]">
      <Link href="/login" className="press inline-flex h-11 items-center rounded-[8px] bg-accent px-5 text-[14px] font-medium text-accent-ink hover:brightness-110">
        Try the live demo
      </Link>
      {beam && (
        <Beam size="pulse-inner" colorVariant="mono" theme="auto" className="pointer-events-none absolute inset-0" style={{ borderRadius: 8 }}>
          <div className="size-full" style={{ borderRadius: 8 }} />
        </Beam>
      )}
    </span>
  );
}
