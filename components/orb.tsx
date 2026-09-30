'use client';

import dynamic from 'next/dynamic';

/**
 * Code-split wrappers for the two animation libraries. They are only pulled in when a step is actually running,
 * so pages that never show a wait state (landing, guide, reports) do not download them at all.
 */
export const Orb = dynamic(() => import('thinking-orbs').then((m) => m.ThinkingOrb), {
  ssr: false,
  loading: () => <span className="inline-block size-5" aria-hidden />,
});

export const Beam = dynamic(() => import('border-beam').then((m) => m.BorderBeam), { ssr: false });
