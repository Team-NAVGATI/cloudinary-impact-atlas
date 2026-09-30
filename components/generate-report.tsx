'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, fieldClass, Label, Notice } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';
import { cn } from '@/lib/utils';

const SCENARIOS = [
  { id: 'live', label: 'Live forecast', rain: null, hint: 'Uses today’s real forecast' },
  { id: 'heavy', label: 'Heavy rain', rain: 100, hint: '100 mm in 24 h' },
  { id: 'vheavy', label: 'Very heavy', rain: 180, hint: '180 mm in 24 h' },
  { id: 'michaung', label: 'Michaung-scale', rain: 350, hint: '350 mm in 24 h, like Dec 2023' },
] as const;

export function GenerateReport({ zones, defaultZoneId }: { zones: { id: string; name: string }[]; defaultZoneId?: string }) {
  const router = useRouter();
  const [zoneId, setZoneId] = useState(defaultZoneId ?? zones[0]?.id ?? '');
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['id']>('live');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!zoneId) return;
    setBusy(true);
    setError(null);
    const sc = SCENARIOS.find((s) => s.id === scenario)!;
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId,
          scenario: sc.rain ? { rain24Mm: sc.rain, label: `${sc.label} rainfall` } : null,
        }),
      });
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
      <form onSubmit={submit} className="rounded-card border border-line bg-surface p-4" aria-busy={busy}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor="gr-zone">Zone</Label>
            <select id="gr-zone" className={fieldClass} value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={busy}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          {busy ? (
            <Working label="Pulling weather, writing the report…" state="composing" />
          ) : (
            <Button type="submit" variant="primary">
              Generate report
            </Button>
          )}
        </div>
        <fieldset className="mt-4" disabled={busy}>
          <legend className="mb-1.5 text-xs font-medium text-muted">Rainfall</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCENARIOS.map((s) => (
              <label
                key={s.id}
                className={cn(
                  'press cursor-pointer rounded-field border px-3 py-2 text-[13px]',
                  scenario === s.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'
                )}
              >
                <input type="radio" name="scenario" value={s.id} checked={scenario === s.id} onChange={() => setScenario(s.id)} className="sr-only" />
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-muted">{s.hint}</span>
              </label>
            ))}
          </div>
          {scenario !== 'live' && (
            <p className="mt-2 text-xs text-muted">Simulations are clearly labelled in the report and are meant for rehearsal, not real alerts.</p>
          )}
        </fieldset>
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </form>
    </ActiveBeam>
  );
}
