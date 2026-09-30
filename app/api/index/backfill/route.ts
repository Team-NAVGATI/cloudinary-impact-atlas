import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { AiAnalysis, MediaAsset } from '@/lib/domain';
import { fetchPhash, indexAsset, loadIndex } from '@/lib/embeddings';
import { ASSET_COLS } from '@/lib/columns';

export const maxDuration = 60;

/**
 * POST /api/index/backfill {batch?}
 * Builds the semantic index (text + image vectors) for evidence that has none yet, plus Cloudinary's perceptual
 * hash for duplicate detection. Called in a loop by the UI so progress is visible.
 */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const body = await req.json().catch(() => ({}));
  const batch = Math.max(1, Math.min(8, Number(body?.batch) || 5));

  const { vecs, persistedColumns } = await loadIndex(ctx.db, ctx.organizationId);
  const { data: rows } = await ctx.db
    .from('media_assets')
    .select(ASSET_COLS)
    .eq('organization_id', ctx.organizationId)
    .eq('resource_type', 'image')
    .neq('status', 'ARCHIVED')
    .order('created_at', { ascending: true })
    .limit(2000);
  const todo = ((rows ?? []) as MediaAsset[]).filter((r) => !vecs.has(r.id));
  const now = todo.slice(0, batch);

  const ids = now.map((r) => r.id);
  const { data: an } = ids.length ? await ctx.db.from('ai_analyses').select('*').in('media_asset_id', ids).order('created_at', { ascending: false }) : { data: [] };
  const latest = new Map<string, AiAnalysis>();
  for (const a of (an ?? []) as AiAnalysis[]) if (!latest.has(a.media_asset_id)) latest.set(a.media_asset_id, a);

  const results = await Promise.all(
    now.map(async (a) => {
      const analysis = latest.get(a.id);
      const r = await indexAsset(ctx.db, ctx.organizationId, a, analysis?.description, analysis?.environmental_signals);
      if (persistedColumns || r.persisted) {
        const ph = await fetchPhash(a.cloudinary_public_id);
        if (ph) await ctx.db.from('media_assets').update({ phash: ph }).eq('id', a.id);
      }
      return r;
    })
  );
  return apiOk({
    done: results.filter((r) => r.indexed).length,
    failed: results.filter((r) => !r.indexed).map((r) => r.note),
    remaining: Math.max(0, todo.length - results.filter((r) => r.indexed).length),
    persisted: results.some((r) => r.persisted) || persistedColumns,
  });
}
