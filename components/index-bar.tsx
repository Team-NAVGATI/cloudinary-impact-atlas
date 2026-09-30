'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';

/**
 * Builds the semantic index (text + image vectors) in short batches. Shown only when some photos are not yet
 * searchable by meaning and by look, so "Ask" never silently falls back to keywords without telling you.
 */
export function IndexBar({ indexed, total, persisted, canEmbed = true }: { indexed: number; total: number; persisted: boolean; canEmbed?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(indexed);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(persisted);

  // Without an embedding key there is nothing to build; Ask says it is using keyword search only.
  if (!canEmbed || total === 0 || (done >= total && !error && saved)) return null;
  const complete = done >= total;

  async function run() {
    setRunning(true);
    setError(null);
    let guard = 0;
    try {
      for (;;) {
        const res = await fetch('/api/index/backfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: 6 }) });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Indexing failed');
        const { done: d, remaining, persisted: p, failed } = json.data as { done: number; remaining: number; persisted: boolean; failed: string[] };
        setDone(total - remaining);
        setSaved(p);
        if (remaining <= 0) break;
        if (d === 0) throw new Error(failed?.[0] ?? 'Nothing could be indexed');
        if (++guard > 80) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Indexing failed');
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <ActiveBeam active={running} radius={12}>
      <div className="rounded-card border border-line bg-surface p-4" data-tour="index-bar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">
              {complete ? 'Search index is built, but not saved permanently' : `${total - done} photo${total - done === 1 ? ' is' : 's are'} not yet searchable by meaning or by look`}
            </p>
            <p className="mt-0.5 text-xs text-muted text-pretty">
              {complete
                ? 'Run migration 6 in Supabase to keep it after a restart. Until then Ask uses a memory copy.'
                : 'Ask combines keywords, the meaning of descriptions and what pictures look like. Photos without vectors are found by keywords only.'}
            </p>
          </div>
          {running ? (
            <Working label={`Indexing… ${done} of ${total}`} state="weaving" />
          ) : (
            !complete && (
              <Button variant="primary" onClick={run}>
                Build search index
              </Button>
            )
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round((done / total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Indexing progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>
    </ActiveBeam>
  );
}
