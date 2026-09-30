'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, fieldClass, Label, Notice } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';

export function AssetActions({
  assetId,
  zoneId,
  phase,
  zones,
  analysed,
}: {
  assetId: string;
  zoneId: string | null;
  phase: string;
  zones: { id: string; name: string }[];
  analysed: boolean;
}) {
  const router = useRouter();
  const [zone, setZone] = useState(zoneId ?? '');
  const [ph, setPh] = useState(phase);
  const [busy, setBusy] = useState<'analyze' | 'save' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function analyze() {
    setBusy('analyze');
    setMsg(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/analyze`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Analysis failed');
      setMsg({ tone: 'ok', text: `Analysed with ${json.data.provider.replace(/-/g, ' ')}. Severity ${json.data.severity} of 3.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Analysis failed' });
    } finally {
      setBusy(null);
    }
  }

  async function save(action: 'CONFIRMED' | 'CORRECTED') {
    setBusy('save');
    setMsg(null);
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zone || null, phase: ph, review: { action } }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Could not save');
      setMsg({ tone: 'ok', text: action === 'CONFIRMED' ? 'Marked as reviewed.' : 'Correction saved and logged.' });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <ActiveBeam active={busy === 'analyze'} radius={8}>
        <div className="flex items-center justify-between gap-3 rounded-field border border-line bg-surface p-3">
          <p className="text-[13px] text-muted">{analysed ? 'Run the analysis again if the image or settings changed.' : 'Not analysed yet.'}</p>
          {busy === 'analyze' ? (
            <Working label={`Reading the image…`} state="searching" />
          ) : (
            <Button variant={analysed ? 'secondary' : 'primary'} onClick={analyze} disabled={busy !== null}>
              {analysed ? 'Re-analyse' : 'Analyse now'}
            </Button>
          )}
        </div>
      </ActiveBeam>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="aa-zone">Zone</Label>
          <select id="aa-zone" className={fieldClass} value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Not set (city-wide)</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="aa-phase">Phase</Label>
          <select id="aa-phase" className={fieldClass} value={ph} onChange={(e) => setPh(e.target.value)}>
            <option value="BEFORE">Before / normal</option>
            <option value="DURING">During event</option>
            <option value="AFTER">After / recovery</option>
            <option value="BASELINE">Baseline</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => save('CORRECTED')} disabled={busy !== null}>
          Save correction
        </Button>
        <Button onClick={() => save('CONFIRMED')} disabled={busy !== null}>
          Confirm as correct
        </Button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
