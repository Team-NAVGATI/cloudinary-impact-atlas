import { CheckCircle, Info, WarningCircle, XCircle } from '@phosphor-icons/react';
import type { ClaimCheck, Plan, RetrievalTrace } from '@/lib/ask';
import type { Grounding } from '@/lib/retrieval';
import { cn } from '@/lib/utils';

/** Compact trust line under every answer: what was checked, in plain words. */
export function GroundingLine({ grounding, claims, by }: { grounding: Grounding; claims?: ClaimCheck[]; by: string }) {
  const checked = claims?.filter((c) => c.supported !== null) ?? [];
  const ok = checked.filter((c) => c.supported).length;
  const bad = checked.length - ok;
  const good = grounding.status === 'verified' && bad === 0;
  return (
    <p className={cn('mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field px-2.5 py-1.5 text-xs', good ? 'bg-low-soft text-ink' : 'bg-moderate-soft text-ink')}>
      {good ? <CheckCircle size={15} weight="fill" className="text-low" /> : <WarningCircle size={15} weight="fill" className="text-moderate" />}
      <span className="font-medium">{good ? 'Checked against your evidence' : 'Please verify before relying on this'}</span>
      <span className="text-muted">
        {grounding.citations} citation{grounding.citations === 1 ? '' : 's'} valid
        {grounding.invalidCitations.length ? `, ${grounding.invalidCitations.length} broken` : ''}
        {grounding.unsupportedNumbers.length ? `, unsupported figures: ${grounding.unsupportedNumbers.join(', ')}` : ', all figures traced'}
        {by === 'llm' ? (claims ? (checked.length ? ` · claim check ${ok}/${checked.length} supported` : '') : ' · checking claims…') : ''}
      </span>
    </p>
  );
}

const PCT = (n: number | null, total: number) => (n === null ? 'not used' : `${n} of ${total}`);

/** "How this answer was made": the whole reasoning path, in the order it happened. */
export function AnswerTrace({
  plan,
  trace,
  grounding,
  claims,
  model,
  ms,
}: {
  plan?: Plan;
  trace?: RetrievalTrace;
  grounding?: Grounding;
  claims?: ClaimCheck[];
  model?: string;
  ms?: number;
}) {
  if (!trace) return null;
  const rows: [string, React.ReactNode][] = [
    [
      '1. Understood the question',
      <>
        {plan?.by === 'llm' ? 'LLM plan, then checked against your wording.' : 'Rule-based plan.'} Keywords: <b>{plan?.keywords.join(', ') || 'none'}</b>.{' '}
        {plan?.zoneName || plan?.phase || plan?.minSeverity != null
          ? `Filters applied: ${[plan?.zoneName, plan?.phase?.toLowerCase(), plan?.minSeverity != null ? `severity ${plan.minSeverity}+` : null].filter(Boolean).join(', ')}.`
          : 'No filters, because your question did not name one.'}
        {plan?.dropped?.length ? <span className="text-muted"> Ignored suggestions the question did not support: {plan.dropped.join('; ')}.</span> : null}
      </>,
    ],
    [
      '2. Searched three ways',
      <>
        {trace.candidates} candidate items. Keywords (BM25): <b>{PCT(trace.keywordHits, trace.candidates)}</b>. Meaning of the description: <b>{PCT(trace.meaningHits, trace.candidates)}</b>. What the
        picture looks like: <b>{PCT(trace.visualHits, trace.candidates)}</b>.
      </>,
    ],
    [
      '3. Merged the rankings',
      <>
        Reciprocal Rank Fusion (k=60) rewards items several searches agree on. Top {trace.fused} kept. Semantic index covers {trace.indexed} of {trace.indexTotal} items
        {trace.persisted ? '.' : ' (held in memory; run migration 6 to make it permanent).'}
      </>,
    ],
    [
      '4. Wrote the answer',
      <>
        {model ? <code className="font-mono text-xs">{model}</code> : 'Rules'} read only the retrieved items and cited them by number.
        {ms ? ` Total ${(ms / 1000).toFixed(1)}s.` : ''}
      </>,
    ],
    [
      '5. Checked the answer',
      grounding ? (
        <>
          {grounding.numbersChecked} figure{grounding.numbersChecked === 1 ? '' : 's'} traced to the context; {grounding.citations} citation{grounding.citations === 1 ? '' : 's'} match real sources.
          {claims?.length ? (
            <ul className="mt-1.5 space-y-1">
              {claims.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  {c.supported === null ? <Info size={14} className="mt-0.5 shrink-0 text-muted" /> : c.supported ? <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-low" /> : <XCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-severe" />}
                  <span className={cn(c.supported === false && 'text-severe')}>
                    {c.claim} <span className="font-mono text-muted">[{c.refs.join(', ')}]</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        'Pending'
      ),
    ],
  ];
  return (
    <details className="group mt-3 rounded-field border border-line bg-surface-2/50 text-[13px]">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted hover:text-ink">How this answer was made</summary>
      <ol className="space-y-2.5 border-t border-line px-3 py-3">
        {rows.map(([t, body]) => (
          <li key={t}>
            <p className="text-xs font-semibold">{t}</p>
            <div className="mt-0.5 text-muted">{body}</div>
          </li>
        ))}
        {trace.notes.length > 0 && <li className="text-xs text-moderate">{trace.notes.join(' ')}</li>}
      </ol>
    </details>
  );
}
