import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReportActions } from '@/components/report-actions';
import { ReportView } from '@/components/report-view';
import { Panel, PanelHeader } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import type { Contact, Report } from '@/lib/domain';
import { loadReportAssets } from '@/lib/reports/assets';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = (await getSessionContext())!;
  const { db, organizationId } = ctx;

  const { data } = await db.from('reports').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
  if (!data) notFound();
  const report = data as Report;

  const [assets, { data: contacts }, { data: alerts }] = await Promise.all([
    loadReportAssets(db, report.content_markdown),
    db.from('contacts').select('*').eq('organization_id', organizationId).eq('active', true).order('name'),
    db.from('alerts').select('*').eq('report_id', id).order('created_at', { ascending: false }).limit(8),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav aria-label="Breadcrumb" className="no-print text-xs text-muted">
        <Link href="/reports" className="underline">
          Reports
        </Link>{' '}
        / <span className="text-ink">{report.title}</span>
      </nav>

      <ReportActions
        reportId={report.id}
        shareToken={report.share_token}
        storyUrl={report.story_url}
        zoneId={report.zone_id}
        contacts={((contacts ?? []) as Contact[]).map((c) => ({ id: c.id, name: c.name, designation: c.designation, email: c.email, zone_id: c.zone_id }))}
      />

      <Panel className="print-full px-5 py-6 sm:px-10 sm:py-9">
        <ReportView markdown={report.content_markdown} assets={assets} />
      </Panel>

      {(alerts ?? []).length > 0 && (
        <Panel className="no-print">
          <PanelHeader title="Dispatch log" />
          <ul className="divide-y divide-line text-[13px]">
            {(alerts as { id: string; recipient_email: string; status: string; created_at: string; error: string | null }[]).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="font-mono text-xs">{a.recipient_email}</span>
                <span className="text-xs text-muted">
                  {a.status.charAt(0) + a.status.slice(1).toLowerCase()} · {formatDate(a.created_at, true)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
