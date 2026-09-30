'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, fieldClass, Label, Notice } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';
import { cn } from '@/lib/utils';

export interface PickedItem {
  id: string;
  title: string;
  thumb: string;
}

/** Report for any evidence: either the items you picked in the Library, or everything matching a filter. */
export function EvidenceReportForm({
  zones,
  events,
  picked,
}: {
  zones: { id: string; name: string }[];
  events: string[];
  picked: PickedItem[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<'picked' | 'filter'>(picked.length ? 'picked' : 'filter');
  const [title, setTitle] = useState('');
  const [zone, setZone] = useState('');
  const [phase, setPhase] = useState('');
  const [sev, setSev] = useState('');
  const [event, setEvent] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      scope === 'picked'
        ? { title: title || null, ids: picked.map((p) => p.id) }
        : { title: title || null, zone: zone || null, phase: phase || null, minSeverity: sev ? Number(sev) : null, event: event || null, q: q || null };
    try {
      const res = await fetch('/api/reports/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Could not generate the report');
      router.push(`/reports/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the report');
      setBusy(false);
    }
  }

  return (
    <ActiveBeam active={busy} radius={12}>
      <form onSubmit={submit} className="space-y-4 rounded-card border border-line bg-surface p-4" aria-busy={busy}>
        <div>
          <Label htmlFor="er-title">Title (optional)</Label>
          <input id="er-title" className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Velachery during Cyclone Michaung" maxLength={140} disabled={busy} />
        </div>

        <fieldset disabled={busy}>
          <legend className="mb-1.5 text-xs font-medium text-muted">What goes in the report</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['picked', `The ${picked.length || 'items'} I picked in the Library`, picked.length ? 'Exactly these photos' : 'Pick photos in the Library first'],
                ['filter', 'Everything that matches a filter', 'Site, phase, severity, event or a search'],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={cn('press cursor-pointer rounded-field border px-3 py-2 text-[13px]', scope === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2', v === 'picked' && !picked.length && 'pointer-events-none opacity-50')}>
                <input type="radio" name="scope" value={v} checked={scope === v} onChange={() => setScope(v)} className="sr-only" />
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {scope === 'picked' && picked.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Selected evidence">
            {picked.slice(0, 12).map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.title} title={p.title} className="size-14 rounded-md border border-line object-cover" />
              </li>
            ))}
            {picked.length > 12 && <li className="grid size-14 place-items-center rounded-md bg-surface-2 text-xs text-muted">+{picked.length - 12}</li>}
          </ul>
        )}

        {scope === 'filter' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="er-zone">Site</Label>
              <select id="er-zone" className={fieldClass} value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="">Any site</option>
                <option value="none">City-wide only</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="er-phase">Phase</Label>
              <select id="er-phase" className={fieldClass} value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="">Any phase</option>
                <option value="BEFORE">Before / normal</option>
                <option value="DURING">During event</option>
                <option value="AFTER">After / recovery</option>
              </select>
            </div>
            <div>
              <Label htmlFor="er-sev">Severity</Label>
              <select id="er-sev" className={fieldClass} value={sev} onChange={(e) => setSev(e.target.value)}>
                <option value="">Any</option>
                <option value="1">Minor water or worse</option>
                <option value="2">Waterlogged or worse</option>
                <option value="3">Severe only</option>
              </select>
            </div>
            <div>
              <Label htmlFor="er-event">Event</Label>
              <select id="er-event" className={fieldClass} value={event} onChange={(e) => setEvent(e.target.value)}>
                <option value="">Any</option>
                {events.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="er-q">Contains (search words)</Label>
              <input id="er-q" className={fieldClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. boat rescue" maxLength={120} />
            </div>
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex items-center gap-3">
          {busy ? (
            <Working label={`Reading the evidence and writing the report…`} state="composing" />
          ) : (
            <Button type="submit" variant="primary" disabled={scope === 'picked' && !picked.length}>
              Generate report
            </Button>
          )}
        </div>
      </form>
    </ActiveBeam>
  );
}
