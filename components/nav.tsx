'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChatCircleText,
  Files,
  GitDiff,
  Images,
  Lightning,
  SignOut,
  TreeStructure,
  UploadSimple,
  type Icon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const GROUPS: { title: string; items: { href: string; label: string; icon: Icon; tour?: string }[] }[] = [
  {
    title: 'Work',
    items: [
      { href: '/studio', label: 'Studio', icon: UploadSimple, tour: 'nav-studio' },
      { href: '/library', label: 'Library', icon: Images, tour: 'nav-library' },
      { href: '/ask', label: 'Ask', icon: ChatCircleText, tour: 'nav-ask' },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { href: '/compare', label: 'Compare', icon: GitDiff },
      { href: '/reports', label: 'Reports', icon: Files, tour: 'nav-reports' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/workflow', label: 'Workflow', icon: TreeStructure },
      { href: '/playbooks', label: 'Playbooks', icon: Lightning },
      { href: '/guide', label: 'Guide', icon: BookOpen },
    ],
  },
];

const FLAT = GROUPS.flatMap((g) => g.items);

export function Nav({ orgName, email }: { orgName: string; email: string }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex" aria-label="Sidebar">
        <div className="px-4 pb-3 pt-4">
          <Link href="/studio" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            Impact Atlas
          </Link>
          <p className="mt-2 truncate text-xs text-muted" title={orgName}>
            {orgName}
          </p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2" aria-label="Main">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="px-2.5 pb-1 text-[11px] font-medium text-muted">{g.title}</p>
              <div className="space-y-0.5">
                {g.items.map(({ href, label, icon: I, tour }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      data-tour={tour}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'press flex h-9 items-center gap-2.5 rounded-field px-2.5 text-[13px] font-medium',
                        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
                      )}
                    >
                      <I size={17} weight={active ? 'fill' : 'regular'} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted" title={email}>
              {email}
            </p>
            <ThemeToggle />
          </div>
          <button
            onClick={signOut}
            disabled={busy}
            className="press mt-2 flex h-8 w-full items-center gap-2 rounded-field px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60"
          >
            <SignOut size={16} /> {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface lg:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <Link href="/studio" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            Impact Atlas
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={signOut} disabled={busy} className="press grid size-8 place-items-center text-muted" aria-label="Sign out">
              <SignOut size={18} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
          {FLAT.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'press shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium',
                isActive(href) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-6 place-items-center rounded-md bg-accent text-accent-ink', className)} aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="5.6" />
        <path d="M2.4 8h11.2M8 2.4c1.9 1.6 2.8 3.5 2.8 5.6S9.9 12 8 13.6M8 2.4C6.1 4 5.2 5.9 5.2 8S6.1 12 8 13.6" />
      </svg>
    </span>
  );
}
