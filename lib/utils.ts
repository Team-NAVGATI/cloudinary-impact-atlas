import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return 'Unknown date';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kolkata',
  });
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export const RISK_STYLES: Record<RiskLevel, { label: string; text: string; bg: string; dot: string }> = {
  LOW: { label: 'Low', text: 'text-low', bg: 'bg-low-soft', dot: 'bg-low' },
  MODERATE: { label: 'Moderate', text: 'text-moderate', bg: 'bg-moderate-soft', dot: 'bg-moderate' },
  HIGH: { label: 'High', text: 'text-high', bg: 'bg-high-soft', dot: 'bg-high' },
  SEVERE: { label: 'Severe', text: 'text-severe', bg: 'bg-severe-soft', dot: 'bg-severe' },
};

export const SEVERITY_LABELS = ['No flooding', 'Minor water', 'Waterlogged', 'Severe flooding'] as const;
