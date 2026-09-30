'use client';

import { useMemo, useState } from 'react';
import type { MapSite } from '@/lib/collections';
import { cn } from '@/lib/utils';

const PHASE = { BEFORE: 'Before', DURING: 'During', AFTER: 'After', BASELINE: 'Baseline' } as const;

/** Severity 0..3 mapped to semantic colours (redundant with the text label shown in each tile). */
function tone(avg: number | null): string {
  if (avg === null) return 'var(--surface-2)';
  if (avg < 0.75) return 'color-mix(in srgb, var(--low) 55%, var(--surface))';
  if (avg < 1.5) return 'color-mix(in srgb, var(--moderate) 55%, var(--surface))';
  if (avg < 2.4) return 'color-mix(in srgb, var(--high) 60%, var(--surface))';
  return 'color-mix(in srgb, var(--severe) 65%, var(--surface))';
}

/**
 * Treemap of the whole collection: columns are sites (width = how much evidence), tiles inside are phases
 * (height = share), colour is average flood severity. Clicking a tile filters the grid.
 */
export function EvidenceMap({
  sites,
  onPick,
}: {
  sites: MapSite[];
  onPick: (zoneId: string | null, phase: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = useMemo(() => sites.reduce((t, s) => t + s.total, 0), [sites]);
  const shown = sites.filter((s) => s.total > 0);

  if (!total) return <p className="p-6 text-[13px] text-muted">No evidence to map yet.</p>;

  return (
    <div>
      <div className="flex h-[360px] w-full gap-1 rounded-card" role="list" aria-label="Evidence map by site and phase">
        {shown.map((s) => (
          <div key={s.zoneId ?? 'none'} role="listitem" className="flex min-w-[54px] flex-col gap-1" style={{ flexGrow: s.total, flexBasis: 0 }}>
            <div className="truncate px-1 text-[11px] font-medium" title={`${s.name}: ${s.total}`}>
              {s.name} <span className="font-mono text-muted">{s.total}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              {s.leaves.map((l) => {
                const id = `${s.zoneId}-${l.phase}`;
                const sev = l.avgSeverity === null ? 'not analysed' : `average severity ${l.avgSeverity.toFixed(1)} of 3`;
                return (
                  <button
                    key={id}
                    onClick={() => onPick(s.zoneId, l.phase)}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    className={cn('press relative min-h-[26px] overflow-hidden rounded-md border border-line/60 p-1.5 text-left', hover === id && 'ring-2 ring-accent')}
                    style={{ flexGrow: l.count, flexBasis: 0, background: tone(l.avgSeverity) }}
                    aria-label={`${s.name}, ${PHASE[l.phase as keyof typeof PHASE] ?? l.phase}: ${l.count} items, ${sev}. Show these.`}
                  >
                    <span className="block truncate text-[11px] font-semibold leading-tight text-ink">{PHASE[l.phase as keyof typeof PHASE] ?? l.phase}</span>
                    <span className="block font-mono text-[11px] tabular-nums text-ink/80">{l.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Width: amount of evidence per site</span>
        <span>Height: share per phase</span>
        <span className="inline-flex items-center gap-2">
          Colour: average severity
          <span className="flex overflow-hidden rounded-sm border border-line" aria-hidden>
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className="h-3 w-6" style={{ background: tone(n) }} />
            ))}
          </span>
          calm to severe
        </span>
      </div>
    </div>
  );
}
