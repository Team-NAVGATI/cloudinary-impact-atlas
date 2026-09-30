'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChatCircleText, Files, GitDiff, GridFour, MagnifyingGlass, SquaresFour, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EvidenceMap } from '@/components/evidence-map';
import { Badge, Button, EmptyState, fieldClass, Notice, Skeleton, SeverityChip } from '@/components/ui';
import { ActiveBeam } from '@/components/working';
import { derive } from '@/lib/cloudinary/urls';
import type { Collections } from '@/lib/collections';
import type { MediaAsset } from '@/lib/domain';

type Row = MediaAsset & { needs_review?: boolean; ai_provider?: string | null; ai_confidence?: number | null; reviewed?: boolean };
import { cn } from '@/lib/utils';

const EXAMPLES = ['flooded road', 'aerial view', 'boat rescue', 'river bridge', 'people wading'];
const PHASE_LABEL: Record<string, string> = { BEFORE: 'Before', DURING: 'During', AFTER: 'After', BASELINE: 'Baseline' };

interface Filters {
  q: string;
  zone: string;
  phase: string;
  sev: string;
  event: string;
  tag: string;
}
const EMPTY: Filters = { q: '', zone: '', phase: '', sev: '', event: '', tag: '' };

export function LibraryClient({ collections, initialZone }: { collections: Collections; initialZone?: string }) {
  const router = useRouter();
  const [f, setF] = useState<Filters>({ ...EMPTY, zone: initialZone ?? '' });
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const [mode, setMode] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const ctl = useRef<AbortController | null>(null);

  const zoneName = (id: string | null) => collections.sites.find((s) => s.zoneId === id)?.label;
  const active = Object.entries(f).filter(([k, v]) => v && k !== 'q');

  useEffect(() => {
    const t = setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true);
      setError(null);
      const p = new URLSearchParams();
      if (f.q.trim()) p.set('q', f.q.trim());
      if (f.zone) p.set('zone', f.zone);
      if (f.phase) p.set('phase', f.phase);
      if (f.sev) p.set('minSeverity', f.sev);
      if (f.event) p.set('event', f.event);
      if (f.tag) p.set('tag', f.tag);
      try {
        const res = await fetch(`/api/search?${p}`, { signal: c.signal });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Search failed');
        setRows(json.data.results);
        setMode(json.data.mode);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [f]);

  const set = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setView('grid');
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 30)));
  const pickedRows = useMemo(() => (rows ?? []).filter((r) => picked.includes(r.id)), [rows, picked]);
  const visible = useMemo(() => (rows ?? []).filter((r) => !onlyReview || r.needs_review), [rows, onlyReview]);
  const reviewCount = useMemo(() => (rows ?? []).filter((r) => r.needs_review).length, [rows]);

  function rail(title: string, items: { key: string; label: string; count: number }[], current: string, onPick: (key: string) => void) {
    if (!items.length) return null;
    return (
      <div>
        <h3 className="px-2 pb-1 text-[11px] font-medium text-muted">{title}</h3>
        <ul>
          {items.map((it) => (
            <li key={it.key}>
              <button
                onClick={() => onPick(current === it.key ? '' : it.key)}
                aria-pressed={current === it.key}
                className={cn(
                  'press flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px]',
                  current === it.key ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-surface-2'
                )}
              >
                <span className="truncate">{it.label}</span>
                <span className="font-mono text-xs tabular-nums text-muted">{it.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Smart collections rail */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto" aria-label="Smart collections" data-tour="collections">
        <div className="rounded-card border border-line bg-surface p-3">
          <p className="text-xs font-medium text-muted">Organised automatically</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{collections.total}</p>
          <p className="text-xs text-muted">
            items &middot; {collections.analysed} analysed{collections.pending ? ` · ${collections.pending} waiting` : ''}
          </p>
        </div>
        <div className="space-y-4 rounded-card border border-line bg-surface p-2">
          {rail('Sites', collections.sites, f.zone || '', (k) => set({ zone: k === 'none' ? 'none' : k }) )}
          {rail('Phase', collections.phases, f.phase, (k) => set({ phase: k }))}
          {rail('Severity', collections.severity.filter((s) => s.count), f.sev, (k) => set({ sev: k }))}
          {rail('Events', collections.events, f.event, (k) => set({ event: k }))}
          {collections.tags.length > 0 && (
            <div>
              <h3 className="px-2 pb-1 text-[11px] font-medium text-muted">AI tags</h3>
              <div className="flex flex-wrap gap-1 px-1">
                {collections.tags.slice(0, 12).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => set({ tag: f.tag === t.key ? '' : t.key })}
                    aria-pressed={f.tag === t.key}
                    className={cn('press rounded-md px-1.5 py-0.5 text-xs', f.tag === t.key ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:text-ink')}
                  >
                    {t.label} <span className="font-mono opacity-70">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ActiveBeam active={loading && rows !== null} radius={8}>
            <div className="relative min-w-[240px] flex-1" style={{ width: 'min(100%, 520px)' }}>
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={f.q}
                onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))}
                placeholder={'Search what is in the photo: flooded road, boat, bridge…'}
                aria-label="Search evidence"
                className={cn(fieldClass, 'pl-9')}
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </ActiveBeam>
          {reviewCount > 0 && (
            <button
              onClick={() => setOnlyReview((v) => !v)}
              aria-pressed={onlyReview}
              className={cn('press inline-flex h-9 items-center gap-1.5 rounded-field border px-3 text-[13px] font-medium', onlyReview ? 'border-moderate bg-moderate-soft text-moderate' : 'border-line bg-surface text-muted hover:text-ink')}
              title="AI was not confident about these, and nobody has confirmed them yet"
            >
              Needs review <span className="font-mono text-xs">{reviewCount}</span>
            </button>
          )}
          <div className="ml-auto flex overflow-hidden rounded-field border border-line" role="group" aria-label="View">
            {(
              [
                ['grid', 'Grid', GridFour],
                ['map', 'Evidence map', SquaresFour],
              ] as const
            ).map(([v, label, I]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn('press inline-flex h-9 items-center gap-1.5 px-3 text-[13px] font-medium', view === v ? 'bg-accent text-accent-ink' : 'bg-surface text-muted hover:text-ink')}
              >
                <I size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        {!f.q && view === 'grid' && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            Try:
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => set({ q: e })} className="press rounded-md bg-surface-2 px-2 py-1 hover:text-ink">
                {e}
              </button>
            ))}
            <Link href="/ask" className="ml-2 text-accent underline">
              or ask a full question
            </Link>
          </div>
        )}

        {(active.length > 0 || f.q) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {active.map(([k, v]) => (
              <button key={k} onClick={() => setF((p) => ({ ...p, [k]: '' }))} className="press inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                {k === 'zone' ? (v === 'none' ? 'City-wide' : zoneName(v) ?? 'Site') : k === 'phase' ? PHASE_LABEL[v] : k === 'sev' ? `Severity ${v}+` : v} <X size={12} />
              </button>
            ))}
            <button onClick={() => setF(EMPTY)} className="text-xs text-muted underline">
              Clear all
            </button>
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        {view === 'map' ? (
          <div className="rounded-card border border-line bg-surface p-4" data-tour="map">
            <h2 className="text-[13px] font-semibold">How your evidence is organised</h2>
            <p className="mb-3 mt-0.5 text-xs text-muted">Every tile is a real group. Click one to see its photos.</p>
            <EvidenceMap
              sites={collections.map}
              onPick={(zoneId, phase) => set({ zone: zoneId ?? 'none', phase })}
            />
          </div>
        ) : (
          <>
            <p className="text-xs text-muted" aria-live="polite">
              {rows && !loading ? `${rows.length} result${rows.length === 1 ? '' : 's'}${mode === 'fuzzy' ? ' (including partial matches)' : ''}` : ' '}
            </p>
            {rows === null ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/2.4]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-card border border-line bg-surface">
                <EmptyState title="Nothing matches. Try a broader word, or clear a filter." />
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {visible.map((a) => {
                  const on = picked.includes(a.id);
                  return (
                    <li key={a.id} className="group relative">
                      <button
                        onClick={() => toggle(a.id)}
                        aria-pressed={on}
                        aria-label={`${on ? 'Unselect' : 'Select'} ${a.title ?? a.original_filename}`}
                        className={cn(
                          'press absolute left-2 top-2 z-10 grid size-6 place-items-center rounded-md border text-xs font-bold',
                          on ? 'border-accent bg-accent text-accent-ink' : 'border-white/70 bg-black/40 text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                        )}
                      >
                        {'✓'}
                      </button>
                      <Link
                        href={`/assets/${a.id}`}
                        className={cn('press block overflow-hidden rounded-card border bg-surface hover:border-accent/60', on ? 'border-accent ring-2 ring-accent/40' : 'border-line')}
                      >
                        <div className="relative aspect-[3/2] bg-surface-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={derive(a.cloudinary_url, 'thumb')} alt={a.title ?? a.original_filename} loading="lazy" className="size-full object-cover" />
                        </div>
                        <div className="space-y-1.5 p-3">
                          <p className="line-clamp-2 text-[13px] font-medium leading-snug">{a.title ?? a.original_filename}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SeverityChip severity={a.status === 'ANALYZED' ? a.severity : null} />
                            <Badge>{PHASE_LABEL[a.phase] ?? a.phase}</Badge>
                            {a.needs_review && <Badge className="bg-moderate-soft text-moderate" >Needs review</Badge>}
                          </div>
                          <p className="truncate text-xs text-muted">{zoneName(a.zone_id) ?? 'City-wide'}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {picked.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2.5 shadow-xl lg:left-[17rem] lg:right-8 lg:mx-auto" role="region" aria-label="Selection actions">
          <span className="px-2 text-[13px] font-medium">{picked.length} selected</span>
          <Button variant="primary" onClick={() => router.push(`/reports?ids=${picked.join(',')}`)}>
            <Files size={16} /> Make a report
          </Button>
          <Button onClick={() => router.push(`/ask?ids=${picked.join(',')}`)}>
            <ChatCircleText size={16} /> Ask about these
          </Button>
          {picked.length === 2 && (
            <Button onClick={() => router.push(`/compare?before=${pickedRows[0]?.id ?? picked[0]}&after=${pickedRows[1]?.id ?? picked[1]}`)}>
              <GitDiff size={16} /> Compare
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={() => setPicked([])}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
