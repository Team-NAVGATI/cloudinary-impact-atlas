'use client';

import { Moon, Sun, SunHorizon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Mode = 'system' | 'light' | 'dark';
const ORDER: Mode[] = ['system', 'light', 'dark'];

function apply(mode: Mode) {
  const el = document.documentElement;
  if (mode === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', mode);
}

/** Three-state theme switch. The choice is remembered per browser; system is the default. */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('atlas.theme') as Mode | null;
      if (saved && ORDER.includes(saved)) setMode(saved);
    } catch {
      /* storage may be blocked */
    }
  }, []);

  function next() {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(m);
    apply(m);
    try {
      localStorage.setItem('atlas.theme', m);
    } catch {
      /* ignore */
    }
  }

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : SunHorizon;
  return (
    <button
      type="button"
      onClick={next}
      className={cn('press grid size-8 place-items-center rounded-field text-muted hover:bg-surface-2 hover:text-ink', className)}
      aria-label={`Theme: ${mode}. Click to change.`}
      title={`Theme: ${mode}`}
    >
      <Icon size={17} />
    </button>
  );
}

/** Inline script (rendered in <head>) so the saved theme applies before first paint. */
export const THEME_INIT = `try{var t=localStorage.getItem('atlas.theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
