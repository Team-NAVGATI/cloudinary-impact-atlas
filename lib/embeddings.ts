import { v2 as cloudinary } from 'cloudinary';
import type { Db } from '@/lib/auth';
import { isNvidiaConfigured, nvidiaPost } from '@/lib/ai/nvidia';
import { getCloudinaryConfig, isCloudinaryConfigured } from '@/lib/cloudinary/server';
import { derive } from '@/lib/cloudinary/urls';
import type { MediaAsset, VisionSignals } from '@/lib/domain';
import { formatDate } from '@/lib/utils';

/* -------------------------------------------------------------------------------------------------
 * Semantic index
 *   - One multimodal model (NVIDIA Llama Nemotron Embed VL) embeds BOTH the pixels and a contextualised text
 *     description into the same space, so a text query can match a picture directly.
 *   - "Contextual" text (site, phase, event, date, caption, tags prepended) follows Anthropic's Contextual
 *     Retrieval idea: a chunk that carries its own context retrieves far better than a bare caption.
 *   - Vectors are stored L2-normalised, int8-quantised, base64 (about 2.7 KB each). Similarity is a dot product.
 *   - If migration 6 has not been applied, the index lives in memory only, and the UI says so.
 * ----------------------------------------------------------------------------------------------- */

export const EMBED_MODEL = () => process.env.NVIDIA_EMBED_MODEL || 'nvidia/llama-nemotron-embed-vl-1b-v2';

interface Vec {
  img?: Float32Array;
  txt?: Float32Array;
}
interface OrgIndex {
  vecs: Map<string, Vec>;
  dbLoaded: number; // timestamp of last DB load
  dbColumns: 'unknown' | 'ok' | 'missing';
}

function store(): Map<string, OrgIndex> {
  const g = globalThis as unknown as { __atlasIndex?: Map<string, OrgIndex> };
  return (g.__atlasIndex ??= new Map());
}
function orgIndex(org: string): OrgIndex {
  const s = store();
  if (!s.has(org)) s.set(org, { vecs: new Map(), dbLoaded: 0, dbColumns: 'unknown' });
  return s.get(org)!;
}

/* ---- quantisation ---------------------------------------------------------------------------- */
function normalise(v: number[]): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  const inv = 1 / (Math.sqrt(n) || 1);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}
export function encodeVec(v: Float32Array): string {
  // int8 with a per-vector scale stored in the first 4 bytes
  let max = 0;
  for (const x of v) max = Math.max(max, Math.abs(x));
  const scale = max / 127 || 1;
  const buf = Buffer.alloc(4 + v.length);
  buf.writeFloatLE(scale, 0);
  for (let i = 0; i < v.length; i++) buf.writeInt8(Math.max(-127, Math.min(127, Math.round(v[i] / scale))), 4 + i);
  return buf.toString('base64');
}
export function decodeVec(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  const scale = buf.readFloatLE(0);
  const out = new Float32Array(buf.length - 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt8(4 + i) * scale;
  return normalise(Array.from(out));
}
function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/* ---- embedding calls ------------------------------------------------------------------------- */
export async function embed(inputs: string[], type: 'query' | 'passage'): Promise<Float32Array[]> {
  if (!isNvidiaConfigured()) throw new Error('No NVIDIA API key configured');
  const res = await nvidiaPost<{ data: { embedding: number[]; index: number }[] }>(
    '/embeddings',
    { model: EMBED_MODEL(), input: inputs, input_type: type, encoding_format: 'float', truncate: 'END' },
    { timeoutMs: 40_000, maxAttempts: 3 }
  );
  return res.data.sort((a, b) => a.index - b.index).map((d) => normalise(d.embedding));
}

/** Text that carries its own context, so the vector knows where and when the photo is from. */
export function contextualText(a: Pick<MediaAsset, 'title' | 'phase' | 'event_label' | 'captured_at' | 'tags' | 'location' | 'description'>, caption?: string | null, signals?: Partial<VisionSignals> | null): string {
  const flags = signals ? Object.entries(signals).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')) : [];
  return [
    a.location ? `Site: ${a.location}.` : 'Site: city-wide.',
    `Phase: ${a.phase.toLowerCase()}.`,
    a.event_label ? `Event: ${a.event_label}.` : '',
    a.captured_at ? `Date: ${formatDate(a.captured_at)}.` : '',
    a.title ? `Title: ${a.title}.` : '',
    caption || a.description ? `Description: ${(caption || a.description || '').slice(0, 400)}` : '',
    a.tags?.length ? `Tags: ${a.tags.filter((t) => !['commons'].includes(t)).slice(0, 10).join(', ')}.` : '',
    flags.length ? `Signals: ${flags.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

async function imageInput(a: Pick<MediaAsset, 'cloudinary_url'>): Promise<string> {
  const res = await fetch(derive(a.cloudinary_url, 'nvidia'), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  return `<img src="data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}" />`;
}

/* ---- index maintenance ----------------------------------------------------------------------- */
export interface IndexResult {
  indexed: boolean;
  persisted: boolean;
  note?: string;
}

export async function indexAsset(db: Db, org: string, a: MediaAsset, caption?: string | null, signals?: Partial<VisionSignals> | null): Promise<IndexResult> {
  if (!isNvidiaConfigured()) return { indexed: false, persisted: false, note: 'No NVIDIA key for embeddings' };
  try {
    const [txtVec, imgVec] = await embed([contextualText(a, caption, signals), await imageInput(a)], 'passage');
    const idx = orgIndex(org);
    idx.vecs.set(a.id, { txt: txtVec, img: imgVec });

    let persisted = false;
    if (idx.dbColumns !== 'missing') {
      const { error } = await db
        .from('media_assets')
        .update({ emb_txt: encodeVec(txtVec), emb_img: encodeVec(imgVec), emb_model: EMBED_MODEL(), emb_at: new Date().toISOString() })
        .eq('id', a.id);
      if (error) {
        if (/emb_|column|schema cache/i.test(error.message)) idx.dbColumns = 'missing';
      } else {
        idx.dbColumns = 'ok';
        persisted = true;
      }
    }
    return { indexed: true, persisted, note: persisted ? undefined : 'Held in memory (run migration 6 to persist)' };
  } catch (e) {
    return { indexed: false, persisted: false, note: e instanceof Error ? e.message : 'Embedding failed' };
  }
}

/** Load persisted vectors for an organisation (cached for 5 minutes). */
export async function loadIndex(db: Db, org: string): Promise<{ vecs: Map<string, Vec>; persistedColumns: boolean }> {
  const idx = orgIndex(org);
  const stale = Date.now() - idx.dbLoaded > 5 * 60_000;
  if (idx.dbColumns !== 'missing' && stale) {
    const { data, error } = await db.from('media_assets').select('id, emb_txt, emb_img').eq('organization_id', org).not('emb_at', 'is', null).limit(5000);
    if (error) {
      if (/emb_|column|schema cache/i.test(error.message)) idx.dbColumns = 'missing';
    } else {
      idx.dbColumns = 'ok';
      idx.dbLoaded = Date.now();
      for (const r of (data ?? []) as { id: string; emb_txt: string | null; emb_img: string | null }[]) {
        if (!idx.vecs.has(r.id)) idx.vecs.set(r.id, { txt: r.emb_txt ? decodeVec(r.emb_txt) : undefined, img: r.emb_img ? decodeVec(r.emb_img) : undefined });
      }
    }
  }
  return { vecs: idx.vecs, persistedColumns: idx.dbColumns === 'ok' };
}

export function denseRank(vecs: Map<string, Vec>, query: Float32Array, field: 'img' | 'txt', allowed: Set<string> | null, k = 30): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  for (const [id, v] of vecs) {
    if (allowed && !allowed.has(id)) continue;
    const vec = v[field];
    if (vec) out.push({ id, score: dot(query, vec) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

/** Progress of the semantic index for images (the only media type that is embedded today). */
export async function indexProgress(db: Db, org: string): Promise<{ indexed: number; total: number; persisted: boolean; canEmbed: boolean }> {
  const { vecs, persistedColumns } = await loadIndex(db, org);
  const { count } = await db
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org)
    .eq('resource_type', 'image')
    .neq('status', 'ARCHIVED');
  const total = count ?? 0;
  return { indexed: Math.min(vecs.size, total), total, persisted: persistedColumns, canEmbed: isNvidiaConfigured() };
}

export function indexedCount(org: string): number {
  return orgIndex(org).vecs.size;
}

/** Fetch Cloudinary's perceptual hash for duplicate detection (best effort). */
export async function fetchPhash(publicId: string): Promise<string | null> {
  if (!isCloudinaryConfigured()) return null;
  try {
    getCloudinaryConfig();
    const r = (await cloudinary.api.resource(publicId, { phash: true })) as { phash?: string };
    return r.phash ?? null;
  } catch {
    return null;
  }
}

export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
