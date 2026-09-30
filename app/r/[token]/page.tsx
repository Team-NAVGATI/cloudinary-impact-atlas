import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReportView } from '@/components/report-view';
import { LinkButton } from '@/components/ui';
import type { Db } from '@/lib/auth';
import type { Report } from '@/lib/domain';
import { loadReportAssets } from '@/lib/reports/assets';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Flood situation report | Impact Atlas', robots: { index: false, follow: false } };

/**
 * Public read-only report page, reachable only with the report's unguessable share token (64 hex chars).
 * Uses the service-role client server-side and exposes the report Markdown and its images, nothing else.
 */
export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32,128}$/.test(token)) notFound();

  const db = createAdminSupabaseClient() as unknown as Db;
  const { data } = await db.from('reports').select('*').eq('share_token', token).maybeSingle();
  if (!data) notFound();
  const report = data as Report;
  const assets = await loadReportAssets(db, report.content_markdown);

  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Impact Atlas
          </Link>
          <LinkButton href="/architecture" variant="ghost">
            How this report was made
          </LinkButton>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        <div className="print-full rounded-card border border-line bg-surface px-5 py-6 sm:px-10 sm:py-9">
          <ReportView markdown={report.content_markdown} assets={assets} />
        </div>
        <p className="no-print mt-4 text-center text-xs text-muted">Read-only link. Use your browser&apos;s print dialog to save as PDF.</p>
      </main>
    </div>
  );
}
