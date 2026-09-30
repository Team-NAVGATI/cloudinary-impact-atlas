'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';

const PROVIDER_LABEL: Record<string, string> = {
  'cloudinary-ai-vision': 'Cloudinary AI Vision',
  'nvidia-vlm': 'NVIDIA vision model',
  'metadata-heuristic': 'source-metadata rules',
};

/** Analyses all pending images in short batches so progress is visible and requests stay small. */
export function AnalyzeBar({ pending, total }: { pending: number; total: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [remaining, setRemaining] = useState(pending);
  const [providers, setProviders] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(0);
    setProviders({});
    let left = pending;
    let guard = 0;
    try {
      while (left > 0 && guard++ < 60) {
        const res = await fetch('/api/assets/analyze-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: 4 }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Analysis failed');
        const { done: d, remaining: r, providers: p, failed } = json.data as {
          done: number;
          remaining: number;
          providers: string[];
          failed: { error: string }[];
        };
        setDone((x) => x + d);
        setProviders((prev) => {
          const next = { ...prev };
          p.forEach((k) => (next[k] = (next[k] ?? 0) + 1));
          return next;
        });
        left = r;
        setRemaining(r);
        if (d === 0) {
          if (failed.length) throw new Error(failed[0].error);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const analysed = total - remaining;
  const pct = total ? Math.round((analysed / total) * 100) : 100;
  const usedMetadata = providers['metadata-heuristic'];

  return (
    <ActiveBeam active={running} radius={12}>
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">
              {remaining === 0 ? 'All evidence has been analysed' : `${remaining} image${remaining === 1 ? '' : 's'} waiting for analysis`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Each image gets a caption, flood severity, tags and a suggested zone. Cloudinary AI Vision runs first; other providers cover any gap.
            </p>
          </div>
          {running ? (
            <Working label={`Analysing… ${done} done`} state="searching" />
          ) : (
            <Button variant="primary" onClick={run} disabled={remaining === 0}>
              {remaining === 0 ? 'Up to date' : `Analyse ${remaining}`}
            </Button>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Analysis progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        {Object.keys(providers).length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Used: {Object.entries(providers).map(([k, v]) => `${PROVIDER_LABEL[k] ?? k} (${v} batch${v > 1 ? 'es' : ''})`).join(', ')}
          </p>
        )}
        {usedMetadata ? (
          <div className="mt-3">
            <Notice tone="warn">
              Image AI was unavailable, so some ratings come from each photo&apos;s source description and are labelled provisional. Enable the Cloudinary AI Vision add-on or add an NVIDIA API key for true image understanding.
            </Notice>
          </div>
        ) : null}
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>
    </ActiveBeam>
  );
}
