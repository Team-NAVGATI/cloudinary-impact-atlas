'use client';

import Link from 'next/link';
import { ArrowUp, Sparkle } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnswerTrace, GroundingLine } from '@/components/answer-trace';
import { PipelineSteps, type PipelineStep } from '@/components/pipeline';
import { Badge, Notice, SeverityChip } from '@/components/ui';
import { ActiveBeam } from '@/components/working';
import type { ClaimCheck, EvidenceCard, Plan, RetrievalTrace } from '@/lib/ask';
import type { Grounding } from '@/lib/retrieval';
import { readNdjson } from '@/lib/ndjson';
import { cn, formatDate } from '@/lib/utils';

// The Markdown parser is only needed once an answer exists, so it loads on demand instead of with the page.
const AnswerMarkdown = dynamic(() => import('@/components/answer-markdown'), { ssr: false, loading: () => <span className="text-sm text-muted">Formatting answer…</span> });

interface Turn {
  id: string;
  question: string;
  steps: PipelineStep[];
  evidence: EvidenceCard[];
  answer?: { markdown: string; followups: string[]; cited: number[]; by: string; model?: string; grounding: Grounding };
  trace?: RetrievalTrace;
  plan?: Plan;
  claims?: ClaimCheck[];
  error?: string;
  running: boolean;
  ms?: number;
}

const STEPS = (): PipelineStep[] => [
  { id: 'plan', label: 'Plan', status: 'idle' },
  { id: 'retrieve', label: 'Retrieve', status: 'idle' },
  { id: 'read', label: 'Read and answer', status: 'idle' },
];

const PHASE: Record<string, string> = { BEFORE: 'Before', DURING: 'During', AFTER: 'After', BASELINE: 'Baseline' };

export function AskClient({ suggestions, initialQuestion, ids }: { suggestions: string[]; initialQuestion?: string; ids?: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState(initialQuestion ?? '');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scope = useRef<string[] | undefined>(ids);

  const patch = useCallback((id: string, p: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...(typeof p === 'function' ? p(t) : p) } : t)));
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (text.length < 3 || busy) return;
      const id = `${Date.now()}`;
      setTurns((prev) => [...prev, { id, question: text, steps: STEPS(), evidence: [], running: true }]);
      setQ('');
      setBusy(true);
      try {
        localStorage.setItem('atlas.asked', '1');
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, ids: scope.current }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error?.message ?? 'Could not start');
        }
        await readNdjson<Record<string, any>>(res, (ev) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (ev.type === 'step') {
            patch(id, (t) => ({ steps: t.steps.map((s) => (s.id === ev.id ? { ...s, status: ev.status, detail: ev.detail, ms: ev.ms ?? s.ms } : s)) }));
          } else if (ev.type === 'evidence') patch(id, { evidence: ev.items, trace: ev.trace, plan: ev.plan });
          else if (ev.type === 'answer') patch(id, { answer: { markdown: ev.markdown, followups: ev.followups, cited: ev.cited, by: ev.by, model: ev.model, grounding: ev.grounding } });
          else if (ev.type === 'verification') patch(id, { claims: ev.claims });
          else if (ev.type === 'done') patch(id, { running: false, ms: ev.ms });
          else if (ev.type === 'error') throw new Error(ev.message);
        });
      } catch (e) {
        patch(id, { error: e instanceof Error ? e.message : 'Something went wrong', running: false });
      } finally {
        patch(id, { running: false });
        setBusy(false);
      }
    },
    [busy, patch]
  );

  useEffect(() => {
    if (initialQuestion && ids?.length) void ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, turns[turns.length - 1]?.answer]);

  function jump(turnId: string, n: number) {
    const el = document.getElementById(`ev-${turnId}-${n}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(`${turnId}-${n}`);
    setTimeout(() => setHighlight(null), 1800);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-28">
      {turns.length === 0 && (
        <div className="pt-6 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
            <Sparkle size={22} weight="fill" />
          </span>
          <h2 className="display mt-4 text-3xl font-semibold md:text-4xl">Ask your evidence</h2>
          <p className="mx-auto mt-2 max-w-lg text-[14px] text-muted text-pretty">
            Ask in plain language. Atlas searches every photo, caption, tag, report and live forecast, then answers with the sources attached.
          </p>
          {ids?.length ? <p className="mt-3 text-[13px] text-accent">Scoped to your {ids.length} selected item{ids.length === 1 ? '' : 's'}.</p> : null}
          <ul className="mx-auto mt-6 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s}>
                <button onClick={() => ask(s)} className="press w-full rounded-card border border-line bg-surface px-4 py-3 text-left text-[13px] font-medium hover:border-accent/60">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {turns.map((t) => (
        <article key={t.id} className="space-y-3" aria-live="polite">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-card rounded-br-md bg-accent px-4 py-2.5 text-[14px] text-accent-ink">{t.question}</p>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <PipelineSteps steps={t.steps} />
            {t.error && (
              <div className="mt-3">
                <Notice tone="error">{t.error}</Notice>
              </div>
            )}
            {t.answer && (
              <div className="rise-in mt-4">
                <div className="prose prose-sm prose-neutral max-w-none text-ink prose-p:my-2 prose-li:my-0.5 prose-strong:text-ink">
                  <AnswerMarkdown markdown={t.answer.markdown} onJump={(n) => jump(t.id, n)} />
                </div>
                <GroundingLine grounding={t.answer.grounding} claims={t.claims} by={t.answer.by} />
                <AnswerTrace plan={t.plan} trace={t.trace} grounding={t.answer.grounding} claims={t.claims} model={t.answer.model} ms={t.ms} />
              </div>
            )}
          </div>

          {t.evidence.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-muted">
                Sources ({t.answer ? t.answer.cited.length : 0} cited of {t.evidence.length} retrieved)
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...t.evidence]
                  .sort((a, b) => Number(t.answer?.cited.includes(b.n) ?? false) - Number(t.answer?.cited.includes(a.n) ?? false) || a.n - b.n)
                  .slice(0, 9)
                  .map((e) => {
                    const cited = t.answer?.cited.includes(e.n);
                    return (
                      <li
                        key={e.id}
                        id={`ev-${t.id}-${e.n}`}
                        className={cn('rise-in overflow-hidden rounded-card border bg-surface transition-shadow', cited ? 'border-accent/50' : 'border-line', highlight === `${t.id}-${e.n}` && 'ring-2 ring-highlight')}
                      >
                        <Link href={`/assets/${e.id}`} className="block">
                          <div className="relative aspect-[16/10] bg-surface-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={e.thumb} alt={e.title} loading="lazy" className="size-full object-cover" />
                            <span className="absolute left-2 top-2 grid h-6 min-w-6 place-items-center rounded-md bg-black/70 px-1.5 font-mono text-xs font-semibold text-white">{e.n}</span>
                          </div>
                        </Link>
                        <div className="space-y-1.5 p-3">
                          <p className="line-clamp-1 text-[13px] font-medium" title={e.title}>
                            {e.title}
                          </p>
                          {e.caption && <p className="line-clamp-2 text-xs text-muted">{e.caption}</p>}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SeverityChip severity={e.severity} />
                            <Badge>{PHASE[e.phase] ?? e.phase}</Badge>
                            <Badge>{e.site ?? 'City-wide'}</Badge>
                          </div>
                          <p className="line-clamp-1 text-[11px] text-muted">
                            {e.date ? `${formatDate(e.date)} · ` : ''}
                            {e.credit ? `${e.credit}${e.license ? `, ${e.license}` : ''}` : 'Field upload'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          {t.answer && t.answer.followups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Keep going:</span>
              {t.answer.followups.map((f) => (
                <button key={f} onClick={() => ask(f)} disabled={busy} className="press rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-accent/60 disabled:opacity-50">
                  {f}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
      <div ref={endRef} />

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:left-[15rem] lg:px-8">
        <form
          data-tour="ask-input"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
          className="mx-auto max-w-3xl"
        >
          <ActiveBeam active={busy} radius={16}>
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg">
              <label htmlFor="ask-q" className="sr-only">
                Your question
              </label>
              <input
                id="ask-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask anything, e.g. Which photos show boats near Velachery?"
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[14px] outline-none placeholder:text-muted/70"
                autoComplete="off"
                maxLength={400}
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || q.trim().length < 3}
                className="press grid size-10 place-items-center rounded-xl bg-accent text-accent-ink hover:brightness-110 disabled:opacity-40"
                aria-label="Ask"
              >
                <ArrowUp size={18} weight="bold" />
              </button>
            </div>
          </ActiveBeam>
        </form>
      </div>
    </div>
  );
}
