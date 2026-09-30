import { cn, RISK_STYLES, type RiskLevel } from '@/lib/utils';
import { RiskBadge } from '@/components/ui';

export interface DriverLike {
  label: string;
  points: number;
  max: number;
  detail: string;
}

const SEGMENTS: { level: RiskLevel; from: number }[] = [
  { level: 'LOW', from: 0 },
  { level: 'MODERATE', from: 24 },
  { level: 'HIGH', from: 48 },
  { level: 'SEVERE', from: 70 },
];

/** Four-band meter with a marker at the score. Colour is redundant with the text label. */
export function RiskMeter({ score, level, className }: { score: number; level: RiskLevel; className?: string }) {
  return (
    <div
      className={cn('relative', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-valuetext={`${RISK_STYLES[level].label}, ${score} of 100`}
    >
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {SEGMENTS.map((s, i) => {
          const next = SEGMENTS[i + 1]?.from ?? 100;
          return <div key={s.level} className={cn(RISK_STYLES[s.level].dot, 'opacity-30')} style={{ width: `${next - s.from}%` }} />;
        })}
      </div>
      <div
        className={cn('absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full ring-2 ring-surface', RISK_STYLES[level].dot)}
        style={{ left: `${Math.min(99, Math.max(1, score))}%` }}
      />
    </div>
  );
}

/** Report header block: level, score, meter and the reasons behind the score. */
export function RiskPanel({
  level,
  score,
  drivers,
  simulated,
}: {
  level: RiskLevel;
  score: number;
  drivers: DriverLike[];
  simulated?: boolean;
}) {
  const s = RISK_STYLES[level];
  return (
    <div className="avoid-break not-prose my-6 rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className={cn('text-4xl font-semibold tracking-tight', s.text)}>{s.label}</span>
          <span className="text-sm text-muted">flood risk</span>
          {simulated && <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Simulation</span>}
        </div>
        <div className="font-mono text-sm tabular-nums text-muted">
          <span className="text-2xl font-semibold text-ink">{score}</span> / 100
        </div>
      </div>
      <RiskMeter score={score} level={level} className="mt-4" />
      <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {drivers.map((d) => (
          <div key={d.label}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[13px] font-medium">{d.label}</dt>
              <dd className="font-mono text-xs tabular-nums text-muted">
                {d.points}/{d.max}
              </dd>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
              <div className={cn('h-full rounded-full', s.dot)} style={{ width: `${d.max ? (d.points / d.max) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{d.detail}</p>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MetricRow({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <div className="avoid-break not-prose my-6 grid grid-cols-2 divide-line overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-3 lg:grid-cols-5 [&>*]:border-b [&>*]:border-line lg:[&>*]:border-b-0 lg:[&>*:not(:last-child)]:border-r">
      {items.map((m) => (
        <div key={m.label} className="px-4 py-3">
          <div className="text-xs text-muted">{m.label}</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{m.value}</div>
          {m.note && <div className="text-xs text-muted">{m.note}</div>}
        </div>
      ))}
    </div>
  );
}

export { RiskBadge };
