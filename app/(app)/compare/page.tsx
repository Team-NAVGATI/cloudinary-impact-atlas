import Link from 'next/link';
import { CompareClient, type PickAsset } from '@/components/compare-client';
import { SetupNeeded } from '@/components/setup-needed';
import { EmptyState, PageHeader, Panel, PanelHeader } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import type { Comparison, Zone } from '@/lib/domain';
import { formatDate } from '@/lib/utils';

export const metadata = { title: 'Compare | Impact Atlas' };
export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const ctx = (await getSessionContext())!;
  const { db, organizationId } = ctx;

  const [{ data: assetRows, error }, { data: zones }, { data: cmps }] = await Promise.all([
    db
      .from('media_assets')
      .select('id, title, original_filename, phase, severity, zone_id, cloudinary_url, status')
      .eq('organization_id', organizationId)
      .eq('resource_type', 'image')
      .neq('status', 'ARCHIVED')
      .order('phase')
      .order('severity', { ascending: false, nullsFirst: false })
      .limit(200),
    db.from('zones').select('id, name').eq('organization_id', organizationId),
    db.from('comparisons').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(6),
  ]);
  if (error) return <SetupNeeded detail={error.message} />;

  const zoneName = new Map(((zones ?? []) as Pick<Zone, 'id' | 'name'>[]).map((z) => [z.id, z.name]));
  const assets: PickAsset[] = (assetRows ?? []).map(
    (a: { id: string; title: string | null; original_filename: string; phase: string; severity: number | null; zone_id: string | null; cloudinary_url: string }) => ({
      id: a.id,
      title: a.title ?? a.original_filename,
      phase: a.phase,
      severity: a.severity,
      zone: a.zone_id ? zoneName.get(a.zone_id) ?? null : null,
      cloudinary_url: a.cloudinary_url,
    })
  );

  // Suggested pair: a calm "before" image against the most severe "during" image.
  const calm = assets.filter((a) => a.phase === 'BEFORE').sort((x, y) => (x.severity ?? 9) - (y.severity ?? 9))[0];
  const worst = assets.filter((a) => a.phase === 'DURING').sort((x, y) => (y.severity ?? -1) - (x.severity ?? -1))[0];

  return (
    <>
      <PageHeader title="Before and after" description="Line up a normal-day photo against a flood photo and let the app explain what changed." />
      {assets.length < 2 ? (
        <Panel>
          <EmptyState title="Upload at least two images to compare them." />
        </Panel>
      ) : (
        <div className="space-y-6">
          <CompareClient assets={assets} initialBefore={calm?.id} initialAfter={worst?.id} />
          <Panel>
            <PanelHeader title="Saved comparisons" />
            {(cmps ?? []).length === 0 ? (
              <EmptyState title="Saved comparisons appear here and are reused in reports." />
            ) : (
              <ul className="divide-y divide-line">
                {(cmps as Comparison[]).map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <p className="text-[13px] font-medium">{c.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{c.summary}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDate(c.created_at, true)} ·{' '}
                      <Link href={`/assets/${c.before_asset_id}`} className="underline">
                        before
                      </Link>{' '}
                      /{' '}
                      <Link href={`/assets/${c.after_asset_id}`} className="underline">
                        after
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
