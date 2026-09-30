import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn, RISK_STYLES, SEVERITY_LABELS, type RiskLevel } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'press inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-field px-3.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-severe/40 bg-severe-soft text-severe hover:brightness-95',
};

export function Button({ variant = 'secondary', className, ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function LinkButton({
  variant = 'secondary',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted', className)}>
      {children}
    </span>
  );
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const s = RISK_STYLES[level];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold', s.bg, s.text)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {s.label}
      {score !== undefined && <span className="font-mono font-medium tabular-nums opacity-80">{score}</span>}
    </span>
  );
}

const SEV_COLORS = ['bg-low', 'bg-moderate', 'bg-high', 'bg-severe'];
export function SeverityChip({ severity }: { severity: number | null | undefined }) {
  if (severity === null || severity === undefined) return <Badge>Not analysed</Badge>;
  const s = Math.max(0, Math.min(3, severity));
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink" title={`Flood severity ${s} of 3`}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-2.5 w-1 rounded-sm', i < s ? SEV_COLORS[s] : 'bg-line')} />
        ))}
      </span>
      {SEVERITY_LABELS[s]}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card border border-line bg-surface', className)} {...props} />;
}

export function PanelHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="max-w-sm text-[13px] text-muted text-pretty">{title}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export const fieldClass =
  'h-9 w-full rounded-field border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-muted/70 focus-visible:outline-2 disabled:opacity-60';

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const tones = {
    info: 'bg-accent-soft text-ink',
    warn: 'bg-moderate-soft text-ink',
    error: 'bg-severe-soft text-ink',
    ok: 'bg-low-soft text-ink',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-field px-3 py-2 text-[13px]', tones[tone])}>
      {children}
    </div>
  );
}
