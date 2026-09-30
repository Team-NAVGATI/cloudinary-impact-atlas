import Link from 'next/link';
import { EvidenceReportForm, type PickedItem } from '@/components/evidence-report-form';
import { GenerateReport } from '@/components/generate-report';
import { SetupNeeded } from '@/components/setup-needed';
import { Badge, EmptyState, PageHeader, Panel, PanelHeader, RiskBadge } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import { derive } from '@/lib/cloudinary/urls';
import { loadCollections } from '@/lib/collections';
import type { Report, Zone } from '@/lib/domain';
import { cn, formatDate } from '@/lib/utils';

export const metadata = { title: 'Reports | Impact Atlas' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ zone?: string; ids?: string; mode?: string }> }) {
  const ctx = (await getSessionContext())!;
  const sp = await searchParams;
  const { db, organizationId } = ctx;
  const mode = sp.mode === 'risk' || sp.zone ? 'risk' : 'evidence';

  const [{ data: zones, error }, { data: reports }] = await Promise.all([
    db.from('zones').select('id, name').eq('organization_id', organizationId).order('name'),
    db.from('reports').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(40),
  ]);
  if (error) return <SetupNeeded detail={error.message} />;
  const zoneName = new Map(((zones ?? []) as Pick<Zone, 'id' | 'name'>[]).map((z) => [z.id, z.name]));

  const ids = (sp.ids ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 40);
  let picked: PickedItem[] = [];
  if (ids.length) {
    const { data } = await db.from('media_assets').select('id, title, original_filename, cloudinary_url').eq('organization_id', organizationId).in('id', ids);
    picked = ((data ?? []) as { id: string; title: string | null; original_filename: string; cloudinary_url: string }[]).map((a) => ({ id: a.id, title: a.title ?? a.original_filename, thumb: derive(a.cloudinary_url, 'thumb') }));
  }
  const collections = mode === 'evidence' ? await loadCollections(db, organizationId) : null;

  const tab = (href: string, label: string, active: boolean) => (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn('press rounded-field px-3 py-1.5 text-[13px] font-medium', active ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Reports" description="Turn evidence into a designed, printable report with sources and traceability, then share it with a private link." />
      <div className="space-y-6">
        <div>
          <div className="mb-3 inline-flex gap-1 rounded-field border border-line bg-surface p-1" role="navigation" aria-label="Report type">
            {tab('/reports', 'Evidence report', mode === 'evidence')}
            {tab('/reports?mode=risk', 'Flood-risk report (Chennai playbook)', mode === 'risk')}
          </div>
          {mode === 'evidence' ? (
            <EvidenceReportForm zones={zones ?? []} events={collections?.events.map((e) => e.label) ?? []} picked={picked} />
          ) : (
            <>
              <p className="mb-2 max-w-2xl text-[13px] text-muted">
                The playbook adds live rainfall, river flow and a transparent risk score to the evidence, then lists what to do first.
              </p>
              <GenerateReport zones={zones ?? []} defaultZoneId={sp.zone} />
            </>
          )}
        </div>

        <Panel>
          <PanelHeader title="All reports" aside={`${reports?.length ?? 0}`} />
          {(reports ?? []).length === 0 ? (
            <EmptyState title="No reports yet. Generate your first one above." />
          ) : (
            <ul className="divide-y divide-line">
              {(reports as Report[]).map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="press flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{r.title}</span>
                      <span className="text-xs text-muted">
                        {r.zone_id ? zoneName.get(r.zone_id) : 'All sites'} · {formatDate(r.created_at, true)}
                        {r.llm_provider === 'rules' ? ' · rule-based text' : r.llm_provider ? ' · AI-written text' : ''}
                      </span>
                    </span>
                    {(r.weather as { kind?: string })?.kind === 'evidence' ? <Badge>Evidence report</Badge> : <RiskBadge level={r.risk_level} score={r.risk_score} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
