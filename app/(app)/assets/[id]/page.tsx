import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetActions } from '@/components/asset-actions';
import { Badge, Panel, PanelHeader, SeverityChip } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import { derive, TRANSFORMS } from '@/lib/cloudinary/urls';
import type { AiAnalysis, MediaAsset, Zone } from '@/lib/domain';
import { formatBytes, formatDate } from '@/lib/utils';
import { ASSET_COLS } from '@/lib/columns';

export const dynamic = 'force-dynamic';

const SIGNALS: Record<string, string> = {
  water_visible: 'Water visible',
  blocked_drain: 'Blocked drain',
  garbage: 'Garbage',
  structures_submerged: 'Structures submerged',
  people_at_risk: 'People at risk',
  river_overflow: 'River overflow',
};

const PROVIDERS: Record<string, string> = {
  'cloudinary-ai-vision': 'Cloudinary AI Vision',
  'nvidia-vlm': 'NVIDIA vision model',
  'metadata-heuristic': 'Source-metadata rules (provisional)',
};

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = (await getSessionContext())!;
  const { db, organizationId } = ctx;

  const { data: assetRow } = await db.from('media_assets').select(ASSET_COLS).eq('id', id).eq('organization_id', organizationId).maybeSingle();
  if (!assetRow) notFound();
  const a = assetRow as MediaAsset;

  const [{ data: zones }, { data: analysisRows }, { data: reviews }, { data: prov }] = await Promise.all([
    db.from('zones').select('*').eq('organization_id', organizationId).order('name'),
    db.from('ai_analyses').select('*').eq('media_asset_id', id).order('created_at', { ascending: false }).limit(1),
    db.from('media_reviews').select('*').eq('media_asset_id', id).order('created_at', { ascending: false }).limit(5),
    db.from('asset_provenance').select('*').eq('media_asset_id', id).order('created_at', { ascending: false }).limit(8),
  ]);
  const zoneList = (zones ?? []) as Zone[];
  const an = ((analysisRows ?? [])[0] as AiAnalysis | undefined) ?? null;
  const zone = zoneList.find((z) => z.id === a.zone_id);
  const activeSignals = an ? Object.entries(SIGNALS).filter(([k]) => an.environmental_signals?.[k as keyof typeof an.environmental_signals]) : [];
  const analysed = a.status === 'ANALYZED';

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-muted">
        <Link href="/library" className="underline">
          Evidence
        </Link>{' '}
        / <span className="text-ink">{a.title ?? a.original_filename}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-card border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={derive(a.cloudinary_url, 'detail')} alt={a.title ?? a.original_filename} className="w-full" width={a.width ?? undefined} height={a.height ?? undefined} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">{a.title ?? a.original_filename}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={analysed ? a.severity : null} />
            <Badge>{a.phase.charAt(0) + a.phase.slice(1).toLowerCase()}</Badge>
            <Badge>{zone?.name ?? 'Zone not set'}</Badge>
            {a.event_label && <Badge>{a.event_label}</Badge>}
          </div>
          {a.description && <p className="max-w-prose text-[14px] text-pretty text-muted">{a.description}</p>}

          <Panel>
            <PanelHeader title="Traceability" aside="Original is never modified" />
            <dl className="grid gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-2">
              <Row k="Cloudinary public ID" v={<code className="break-all font-mono text-xs">{a.cloudinary_public_id}</code>} />
              <Row k="Cloudinary asset ID" v={<code className="break-all font-mono text-xs">{a.cloudinary_asset_id ?? '—'}</code>} />
              <Row k="Version" v={<span className="font-mono tabular-nums">{a.version ?? '—'}</span>} />
              <Row k="ETag" v={<code className="break-all font-mono text-xs">{a.etag ?? '—'}</code>} />
              <Row k="Source" v={a.source_url ? <a className="text-accent underline" href={a.source_url} target="_blank" rel="noopener noreferrer">{a.source_name ?? 'Source'}</a> : (a.source_name ?? 'Field upload')} />
              <Row k="Licence" v={a.license ?? 'Internal'} />
              <Row k="Credit" v={a.attribution ?? '—'} />
              <Row k="Captured" v={formatDate(a.captured_at)} />
              <Row k="File" v={`${a.width ?? '?'}×${a.height ?? '?'} px${a.file_size ? ', ' + formatBytes(a.file_size) : ''}`} />
              <Row k="Uploaded" v={formatDate(a.created_at, true)} />
            </dl>
            <div className="border-t border-line p-4">
              <h3 className="mb-2 text-xs font-semibold text-muted">Delivery URLs derived from this original</h3>
              <ul className="space-y-1.5 text-xs">
                {(['thumb', 'card', 'report', 'compare'] as const).map((k) => (
                  <li key={k} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="w-16 font-medium capitalize">{k}</span>
                    <code className="font-mono text-muted">{TRANSFORMS[k]}</code>
                  </li>
                ))}
              </ul>
              {(prov ?? []).length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Used in {(prov ?? []).filter((p: { used_in_type: string | null }) => p.used_in_type === 'report').length} report placement(s), each recorded with the exact transformation.
                </p>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="What the AI sees" aside={an ? PROVIDERS[an.provider] ?? an.provider : undefined} />
            <div className="space-y-3 p-4 text-[13px]">
              {an ? (
                <>
                  <p className="text-pretty">{an.description || 'No caption returned.'}</p>
                  {activeSignals.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {activeSignals.map(([k, label]) => (
                        <li key={k}>
                          <Badge className="bg-high-soft text-high">{label}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">No risk signals flagged.</p>
                  )}
                  {a.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {a.tags.map((t) => (
                        <li key={t}>
                          <Badge>{t}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted">
                    Model: {an.model}. Confidence {(an.confidence ?? 0).toFixed(2)}.
                    {an.provider === 'metadata-heuristic' && ' Inferred from the source description, not from the pixels. Confirm before relying on it.'}
                  </p>
                </>
              ) : (
                <p className="text-muted">This image has not been analysed yet.</p>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Review</h2>
            <AssetActions assetId={a.id} zoneId={a.zone_id} phase={a.phase} zones={zoneList.map((z) => ({ id: z.id, name: z.name }))} analysed={analysed} />
            {(reviews ?? []).length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-muted">
                {(reviews as { id: string; action: string; created_at: string }[]).map((r) => (
                  <li key={r.id}>
                    {r.action.charAt(0) + r.action.slice(1).toLowerCase()} on {formatDate(r.created_at, true)}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
