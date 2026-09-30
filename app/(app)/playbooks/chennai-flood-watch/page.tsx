import Link from 'next/link';
import { AnalyzeBar } from '@/components/analyze-bar';
import { GenerateReport } from '@/components/generate-report';
import { SetupNeeded } from '@/components/setup-needed';
import { Badge, EmptyState, LinkButton, PageHeader, Panel, PanelHeader, RiskBadge } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import type { Report, Zone } from '@/lib/domain';
import { computeRisk } from '@/lib/risk';
import { formatDate } from '@/lib/utils';
import { fetchWeather, imdClass } from '@/lib/weather/openmeteo';

export const metadata = { title: 'Chennai Flood-Watch | Impact Atlas' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = (await getSessionContext())!;
  const { db, organizationId } = ctx;

  const { data: zoneRows, error: zoneErr } = await db.from('zones').select('*').eq('organization_id', organizationId).order('name');
  if (zoneErr) return <SetupNeeded detail={zoneErr.message} />;
  const zones = (zoneRows ?? []) as Zone[];

  const [{ data: assets }, { data: reports }, weather] = await Promise.all([
    db.from('media_assets').select('id, zone_id, severity, status, resource_type').eq('organization_id', organizationId).neq('status', 'ARCHIVED'),
    db.from('reports').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
    Promise.allSettled(zones.map((z) => fetchWeather(z.lat, z.lng))),
  ]);

  const all = (assets ?? []) as { id: string; zone_id: string | null; severity: number | null; status: string; resource_type: string }[];
  const pending = all.filter((a) => a.status !== 'ANALYZED' && a.resource_type === 'image').length;

  const rows = zones.map((z, i) => {
    const w = weather[i].status === 'fulfilled' ? weather[i].value : null;
    const ev = all.filter((a) => a.zone_id === z.id && a.status === 'ANALYZED');
    const maxSeverity = ev.reduce((m, a) => Math.max(m, a.severity ?? 0), 0);
    const risk = w ? computeRisk(w, { maxSeverity, drainIssues: 0, count: ev.length }) : null;
    return { z, w, ev: ev.length, total: all.filter((a) => a.zone_id === z.id).length, maxSeverity, risk };
  });
  rows.sort((a, b) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1));
  const offline = weather.some((w) => w.status === 'rejected');

  return (
    <>
      <PageHeader
        title="Chennai Flood-Watch"
        description="The first playbook. It connects Atlas evidence to live rainfall and river data, scores each site, and tells the right officer."
        actions={
          <LinkButton href="/upload" variant="primary">
            Upload evidence
          </LinkButton>
        }
      />

      <div className="space-y-5">
        {all.length === 0 ? (
          <Panel>
            <EmptyState
              title="No evidence yet. Load the Chennai flood photo set from Wikimedia Commons (npm run ingest) or upload your own field photos."
              action={
                <LinkButton href="/upload" variant="primary">
                  Upload a photo
                </LinkButton>
              }
            />
          </Panel>
        ) : (
          <AnalyzeBar pending={pending} total={all.filter((a) => a.resource_type === 'image').length} />
        )}

        <Panel>
          <PanelHeader title="Zones by current risk" aside={offline ? 'Some forecasts unavailable' : `Updated ${formatDate(new Date(), true)} IST`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Zone</th>
                  <th className="px-3 py-2 text-right font-medium">Rain 24 h</th>
                  <th className="px-3 py-2 text-right font-medium">Chance</th>
                  <th className="px-3 py-2 text-right font-medium">River</th>
                  <th className="px-3 py-2 text-right font-medium">Evidence</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ z, w, ev, total, risk }) => (
                  <tr key={z.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{z.name}</div>
                      <div className="text-xs capitalize text-muted">{z.kind.toLowerCase()}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {w ? (
                        <>
                          {w.next24hMm}
                          <span className="ml-1 text-xs text-muted">mm</span>
                          <div className="font-sans text-xs text-muted">{imdClass(w.next24hMm).label}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{w ? `${w.peakProb}%` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{w?.river?.ratio != null ? `${w.river.ratio}×` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      <Link href={`/library?zone=${z.id}`} className="underline decoration-line hover:decoration-accent">
                        {ev}
                      </Link>
                      {total > ev && <span className="text-xs text-muted"> / {total}</span>}
                    </td>
                    <td className="px-3 py-2.5">{risk ? <RiskBadge level={risk.level} score={risk.score} /> : <span className="text-xs text-muted">No data</span>}</td>
                    <td className="px-4 py-2.5 text-right">
                      <LinkButton href={`/reports?zone=${z.id}`} className="h-8">
                        Report
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            Rain and river data: Open-Meteo. Score = forecast rain (IMD classes), rain probability, ground saturation, river flow and documented flood exposure.
          </p>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold">Rehearse a storm</h2>
            <GenerateReport zones={zones.map((z) => ({ id: z.id, name: z.name }))} />
          </section>
          <Panel>
            <PanelHeader title="Recent reports" aside={<Link href="/reports" className="text-accent underline">All reports</Link>} />
            {(reports ?? []).length === 0 ? (
              <EmptyState title="No reports yet. Generate one for a zone." />
            ) : (
              <ul className="divide-y divide-line">
                {(reports as Report[]).map((r) => (
                  <li key={r.id}>
                    <Link href={`/reports/${r.id}`} className="press flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{r.title}</span>
                        <span className="text-xs text-muted">{formatDate(r.created_at, true)}</span>
                      </span>
                      {(r.weather as { kind?: string })?.kind === 'evidence' ? <Badge>Evidence</Badge> : <RiskBadge level={r.risk_level} />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
