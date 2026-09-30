import { v2 as cloudinary } from 'cloudinary';
import type { Db } from '@/lib/auth';
import type { MediaAsset, VisionResult, VisionSignals, Zone } from '@/lib/domain';
import { analyzeImage } from '@/lib/ai/vision';
import { getCloudinaryConfig, isCloudinaryConfigured } from '@/lib/cloudinary/server';
import { derive, TRANSFORMS } from '@/lib/cloudinary/urls';
import { indexAsset, type IndexResult } from '@/lib/embeddings';
import { ASSET_COLS } from '@/lib/columns';

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Suggest a monitored site from GPS (nearest within 8 km) or from place names in the text. */
export function suggestZone(
  zones: Zone[],
  asset: Pick<MediaAsset, 'lat' | 'lng' | 'title' | 'description'>,
  caption: string
): { zone: Zone; reason: string } | null {
  if (asset.lat != null && asset.lng != null) {
    let best: { z: Zone; d: number } | null = null;
    for (const z of zones) {
      const d = haversineKm(asset.lat, asset.lng, z.lat, z.lng);
      if (!best || d < best.d) best = { z, d };
    }
    if (best && best.d <= 8) return { zone: best.z, reason: `GPS: ${best.d.toFixed(1)} km from ${best.z.name}` };
  }
  const text = `${asset.title ?? ''} ${asset.description ?? ''} ${caption}`.toLowerCase();
  let best: { z: Zone; hits: number; kw: string } | null = null;
  for (const z of zones) {
    const hit = z.keywords.filter((k) => text.includes(k.toLowerCase()));
    if (hit.length && (!best || hit.length > best.hits)) best = { z, hits: hit.length, kw: hit[0] };
  }
  return best ? { zone: best.z, reason: `Text mentions "${best.kw}"` } : null;
}

export interface DeliveryInfo {
  transformation: string;
  url: string;
  bytes: number | null;
  format: string | null;
  originalBytes: number | null;
  savedPct: number | null;
}

export interface AnalyzeOutcome {
  assetId: string;
  provider: VisionResult['provider'];
  model: string;
  caption: string;
  severity: number;
  confidence: number;
  signals: VisionSignals;
  tags: string[];
  zone: string | null;
  zoneId: string | null;
  zoneReason: string | null;
  attempts: string[];
  cloudinarySynced: boolean;
  delivery: DeliveryInfo;
  semantic: IndexResult;
}

export type AnalyzeStep = 'understand' | 'organise' | 'index';
export type StepListener = (step: AnalyzeStep, data: Record<string, unknown>) => void;

/** What Cloudinary actually delivers for this photo (format negotiated by f_auto, quality by q_auto). */
async function measureDelivery(a: MediaAsset): Promise<DeliveryInfo> {
  const url = derive(a.cloudinary_url, 'detail');
  let bytes: number | null = null;
  let format: string | null = null;
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000), headers: { Accept: 'image/avif,image/webp,image/*' } });
    const len = Number(res.headers.get('content-length'));
    bytes = Number.isFinite(len) && len > 0 ? len : null;
    format = res.headers.get('content-type')?.replace('image/', '') ?? null;
  } catch {
    /* non-fatal */
  }
  const originalBytes = a.file_size ?? null;
  const savedPct = bytes && originalBytes && originalBytes > bytes ? Math.round((1 - bytes / originalBytes) * 100) : null;
  return { transformation: TRANSFORMS.detail, url, bytes, format, originalBytes, savedPct };
}

export async function analyzeAsset(
  db: Db,
  organizationId: string,
  assetId: string,
  onStep?: StepListener
): Promise<AnalyzeOutcome> {
  const { data: asset, error } = await db
    .from('media_assets')
    .select(ASSET_COLS)
    .eq('id', assetId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !asset) throw new Error('Asset not found');
  const a = asset as MediaAsset;
  if (a.resource_type !== 'image') throw new Error('Only images are analysed in this version (videos use poster frames).');

  const { data: zoneRows } = await db.from('zones').select('*').eq('organization_id', organizationId);
  const zones = (zoneRows ?? []) as Zone[];

  // 1. Understand
  const { result, attempts } = await analyzeImage(a);
  onStep?.('understand', {
    provider: result.provider,
    model: result.model,
    caption: result.caption,
    severity: result.severity,
    confidence: result.confidence,
    signals: result.signals,
    tags: result.tags,
  });

  // 2. Organise: match a site, save the analysis, update the record
  const suggestion = suggestZone(zones, a, result.caption);
  const zoneId = a.zone_id ?? suggestion?.zone.id ?? null;
  const zoneName = zones.find((z) => z.id === zoneId)?.name ?? null;

  const { error: insErr } = await db.from('ai_analyses').insert({
    media_asset_id: a.id,
    model: result.model,
    provider: result.provider,
    description: result.caption,
    suggested_activity: result.severity >= 2 ? 'flood response' : 'baseline monitoring',
    suggested_location: suggestion?.zone.name ?? null,
    objects: result.objects,
    environmental_signals: result.signals,
    tags: result.tags,
    severity: result.severity,
    confidence: result.confidence,
    raw_response: { attempts, provider_raw: result.raw, zone_reason: suggestion?.reason ?? null },
  });
  if (insErr) throw new Error(`Could not save analysis: ${insErr.message}`);

  const mergedTags = Array.from(new Set([...(a.tags ?? []), ...result.tags].map((t) => t.toLowerCase()))).slice(0, 18);
  const { error: updErr } = await db
    .from('media_assets')
    .update({
      tags: mergedTags,
      severity: result.severity,
      status: 'ANALYZED',
      analyzed_at: new Date().toISOString(),
      zone_id: zoneId,
      location: zoneName ?? a.location,
      description: a.description || result.caption || null,
    })
    .eq('id', a.id);
  if (updErr) throw new Error(`Could not update asset: ${updErr.message}`);
  onStep?.('organise', {
    zone: zoneName,
    zoneId,
    reason: a.zone_id ? 'Chosen at upload' : (suggestion?.reason ?? 'No site matched; kept as city-wide'),
    phase: a.phase,
  });

  // 3. Index: mirror AI tags and context onto the Cloudinary asset, then measure delivery
  // The three jobs below are independent, so they run together instead of one after another.
  const syncCloudinary = async (): Promise<boolean> => {
    if (!isCloudinaryConfigured()) return false;
    try {
      getCloudinaryConfig();
      await Promise.all([
        cloudinary.uploader.add_tag(result.tags.slice(0, 8).join(','), [a.cloudinary_public_id]),
        cloudinary.uploader.add_context(
          `severity=${result.severity}|ai_provider=${result.provider}${zoneName ? `|zone=${zoneName.replace(/[|=]/g, ' ')}` : ''}`,
          [a.cloudinary_public_id]
        ),
      ]);
      return true;
    } catch {
      return false; // non-fatal: the database is the source of truth
    }
  };
  const [cloudinarySynced, delivery, semantic] = await Promise.all([
    syncCloudinary(),
    measureDelivery(a),
    indexAsset(db, organizationId, { ...a, tags: mergedTags, location: zoneName ?? a.location, description: a.description || result.caption || null }, result.caption, result.signals),
  ]);
  onStep?.('index', { tags: mergedTags, cloudinarySynced, delivery, semantic });

  return {
    assetId: a.id,
    provider: result.provider,
    model: result.model,
    caption: result.caption,
    severity: result.severity,
    confidence: result.confidence,
    signals: result.signals,
    tags: mergedTags,
    zone: zoneName,
    zoneId,
    zoneReason: suggestion?.reason ?? null,
    attempts,
    cloudinarySynced,
    delivery,
    semantic,
  };
}
