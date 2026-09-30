import type { Db } from '@/lib/auth';

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

export interface MapLeaf {
  phase: string;
  count: number;
  avgSeverity: number | null;
}

export interface MapSite {
  zoneId: string | null;
  name: string;
  total: number;
  leaves: MapLeaf[];
}

export interface Collections {
  total: number;
  analysed: number;
  pending: number;
  sites: (Bucket & { zoneId: string | null })[];
  phases: Bucket[];
  severity: Bucket[];
  events: Bucket[];
  tags: Bucket[];
  map: MapSite[];
  dateRange: { from: string | null; to: string | null };
}

const PHASE_LABEL: Record<string, string> = {
  BEFORE: 'Before / normal',
  DURING: 'During event',
  AFTER: 'After / recovery',
  BASELINE: 'Baseline',
};
export const SEVERITY_BUCKET_LABEL = ['No flooding', 'Minor water', 'Waterlogged', 'Severe flooding'];

/**
 * "Smart collections": groupings computed from the evidence itself (site, phase, severity, event, tags).
 * Nothing is hand-sorted; this is what the AI + matching pipeline produced.
 */
export async function loadCollections(db: Db, organizationId: string): Promise<Collections> {
  const [{ data: assets }, { data: zones }] = await Promise.all([
    db
      .from('media_assets')
      .select('id, zone_id, phase, severity, status, event_label, tags, captured_at, created_at')
      .eq('organization_id', organizationId)
      .neq('status', 'ARCHIVED')
      .limit(2000),
    db.from('zones').select('id, name').eq('organization_id', organizationId),
  ]);
  const rows = (assets ?? []) as {
    id: string;
    zone_id: string | null;
    phase: string;
    severity: number | null;
    status: string;
    event_label: string | null;
    tags: string[] | null;
    captured_at: string | null;
    created_at: string;
  }[];
  const zoneName = new Map(((zones ?? []) as { id: string; name: string }[]).map((z) => [z.id, z.name]));

  const count = <K extends string | number>(items: K[]) => {
    const m = new Map<K, number>();
    for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
    return m;
  };

  const siteCounts = count(rows.map((r) => r.zone_id ?? 'none'));
  const sites = [...siteCounts.entries()]
    .map(([k, c]) => ({ key: k, zoneId: k === 'none' ? null : k, label: k === 'none' ? 'City-wide (no site)' : zoneName.get(k) ?? 'Unknown site', count: c }))
    .sort((a, b) => b.count - a.count);

  const phases = [...count(rows.map((r) => r.phase)).entries()]
    .map(([k, c]) => ({ key: k, label: PHASE_LABEL[k] ?? k, count: c }))
    .sort((a, b) => b.count - a.count);

  const analysedRows = rows.filter((r) => r.status === 'ANALYZED');
  const severity = [3, 2, 1, 0].map((lvl) => ({
    key: String(lvl),
    label: SEVERITY_BUCKET_LABEL[lvl],
    count: analysedRows.filter((r) => (r.severity ?? 0) === lvl).length,
  }));

  const events = [...count(rows.map((r) => r.event_label).filter((e): e is string => Boolean(e))).entries()]
    .map(([k, c]) => ({ key: k, label: k, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const tagCounts = count(rows.flatMap((r) => r.tags ?? []).filter((t) => !['chennai', 'commons', 'before', 'during', 'after', 'baseline'].includes(t)));
  const tags = [...tagCounts.entries()]
    .map(([k, c]) => ({ key: k, label: k, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);

  const map: MapSite[] = sites.map((s) => {
    const inSite = rows.filter((r) => (r.zone_id ?? 'none') === s.key);
    const byPhase = new Map<string, typeof inSite>();
    for (const r of inSite) byPhase.set(r.phase, [...(byPhase.get(r.phase) ?? []), r]);
    const leaves: MapLeaf[] = [...byPhase.entries()].map(([phase, list]) => {
      const sev = list.filter((r) => r.severity !== null);
      return { phase, count: list.length, avgSeverity: sev.length ? sev.reduce((t, r) => t + (r.severity ?? 0), 0) / sev.length : null };
    });
    return { zoneId: s.zoneId, name: s.label, total: s.count, leaves: leaves.sort((a, b) => b.count - a.count) };
  });

  const dates = rows.map((r) => r.captured_at ?? r.created_at).filter(Boolean).sort();
  return {
    total: rows.length,
    analysed: analysedRows.length,
    pending: rows.filter((r) => ['UPLOADED', 'PENDING', 'FAILED'].includes(r.status)).length,
    sites,
    phases,
    severity,
    events,
    tags,
    map,
    dateRange: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
  };
}
