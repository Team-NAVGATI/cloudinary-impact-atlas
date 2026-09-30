import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { MediaAsset, Report, Zone } from '@/lib/domain';
import { storyCardUrl } from '@/lib/cloudinary/urls';
import { riskHex } from '@/lib/notify/email';
import { RISK_STYLES } from '@/lib/utils';
import { ASSET_COLS } from '@/lib/columns';

export const maxDuration = 60;

/**
 * POST /api/reports/:id/story
 * Builds a 4:5 share card entirely from Cloudinary transformations (smart crop + text overlays) using the
 * report's strongest evidence photo. Nothing is re-uploaded, and the transformation is stored for traceability.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const { id } = await params;

  const { data: report } = await ctx.db.from('reports').select('*').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (!report) return apiError('NOT_FOUND', 'Report not found', 404);
  const r = report as Report;

  const evidence = (r.evidence as { asset_id: string; severity: number | null }[]) ?? [];
  const heroRef = [...evidence].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))[0];
  if (!heroRef) return apiError('NO_EVIDENCE', 'This report has no evidence image to build a card from', 400);

  const { data: asset } = await ctx.db.from('media_assets').select(ASSET_COLS).eq('id', heroRef.asset_id).maybeSingle();
  if (!asset) return apiError('NOT_FOUND', 'Evidence image missing', 404);
  const a = asset as MediaAsset;

  const { data: zone } = r.zone_id ? await ctx.db.from('zones').select('*').eq('id', r.zone_id).maybeSingle() : { data: null };
  const z = zone as Zone | null;
  const w = r.weather as { next24hMm?: number; peakProb?: number; simulated?: boolean; kind?: string; items?: number };
  const isEvidence = w?.kind === 'evidence';

  const { url, transformation } = storyCardUrl({
    secureUrl: a.cloudinary_url,
    zone: z?.name ?? (isEvidence ? 'Evidence report' : 'Chennai'),
    headline: isEvidence ? r.title.replace(/^Evidence report: /, '') : w?.simulated ? 'What a Michaung-scale night would look like here' : `${RISK_STYLES[r.risk_level].label} flood risk ahead`,
    lines: isEvidence
      ? [`${w?.items ?? evidence.length} evidence items, organised by AI`, 'Every photo traceable to its original', `Lead image: ${(a.title ?? 'field photo').slice(0, 40)}`]
      : [`${w?.next24hMm ?? 0} mm rain expected in 24 hours`, `Chance of rain up to ${w?.peakProb ?? 0}%`, `Evidence: ${(a.title ?? 'field photo').slice(0, 44)}`],
    riskLabel: isEvidence ? 'Evidence' : RISK_STYLES[r.risk_level].label,
    riskHex: isEvidence ? '0F5B45' : riskHex(r.risk_level),
  });

  // Warm + validate the transformation so a bad overlay fails here rather than on the officer's phone.
  const probe = await fetch(url, { method: 'GET' });
  if (!probe.ok) {
    return apiError('CLOUDINARY_TRANSFORM_FAILED', `Cloudinary could not render the card (${probe.status}: ${probe.headers.get('x-cld-error') ?? 'unknown'})`, 502);
  }

  await ctx.db.from('reports').update({ story_url: url }).eq('id', r.id);
  await ctx.db.from('asset_provenance').insert({
    organization_id: ctx.organizationId,
    media_asset_id: a.id,
    purpose: 'story',
    transformation,
    derived_url: url,
    source_version: a.version,
    source_etag: a.etag,
    used_in_type: 'report',
    used_in_id: r.id,
  });
  return apiOk({ url });
}
