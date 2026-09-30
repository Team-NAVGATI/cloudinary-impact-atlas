'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CompareSlider } from '@/components/compare-slider';
import { Button, fieldClass, Label, Notice, Panel } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';
import { derive } from '@/lib/cloudinary/urls';

export interface PickAsset {
  id: string;
  title: string;
  phase: string;
  severity: number | null;
  zone: string | null;
  cloudinary_url: string;
}

export function CompareClient({ assets, initialBefore, initialAfter }: { assets: PickAsset[]; initialBefore?: string; initialAfter?: string }) {
  const router = useRouter();
  const [beforeId, setBeforeId] = useState(initialBefore ?? assets[0]?.id ?? '');
  const [afterId, setAfterId] = useState(initialAfter ?? assets[1]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const before = useMemo(() => assets.find((a) => a.id === beforeId), [assets, beforeId]);
  const after = useMemo(() => assets.find((a) => a.id === afterId), [assets, afterId]);

  async function save() {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch('/api/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeId, afterId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Could not compare');
      setSummary(json.data.summary);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compare');
    } finally {
      setBusy(false);
    }
  }

  const opt = (a: PickAsset) => `${a.title.slice(0, 64)} (${a.phase.toLowerCase()}${a.severity != null ? `, severity ${a.severity}` : ''})`;
  const same = beforeId === afterId;
  const differentSites = Boolean(before && after && (!before.zone || !after.zone || before.zone !== after.zone));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="cmp-before">Before (earlier or normal)</Label>
          <select id="cmp-before" className={fieldClass} value={beforeId} onChange={(e) => setBeforeId(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {opt(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="cmp-after">After (later or flooded)</Label>
          <select id="cmp-after" className={fieldClass} value={afterId} onChange={(e) => setAfterId(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {opt(a)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {before && after ? (
        <CompareSlider
          beforeUrl={derive(before.cloudinary_url, 'compare')}
          afterUrl={derive(after.cloudinary_url, 'compare')}
          beforeLabel={`Before: ${before.title.slice(0, 40)}`}
          afterLabel={`After: ${after.title.slice(0, 40)}`}
        />
      ) : null}

      <ActiveBeam active={busy} radius={12}>
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-md text-[13px] text-muted">
            Both images use the same Cloudinary crop (<code className="font-mono text-xs">c_fill,g_auto</code>) so differences come from the scene, not the framing.
          </p>
          {busy ? (
            <Working label={`Comparing…`} state="weaving" />
          ) : (
            <Button variant="primary" onClick={save} disabled={same || !before || !after}>
              Save and explain the change
            </Button>
          )}
        </Panel>
      </ActiveBeam>

      {same && <Notice tone="warn">Pick two different images.</Notice>}
      {!same && differentSites && (
        <Notice tone="info">
          These two photos are not from the same recorded site, so treat this as a visual reference rather than a change over time. For a true before and after, pick two photos of the same place.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {summary && (
        <Panel className="p-4">
          <h2 className="mb-1 text-[13px] font-semibold">What changed</h2>
          <p className="max-w-prose whitespace-pre-line text-[14px] text-pretty">{summary}</p>
        </Panel>
      )}
    </div>
  );
}
