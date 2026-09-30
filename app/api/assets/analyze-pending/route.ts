import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import { analyzeAsset } from '@/lib/pipeline/analyze';

export const maxDuration = 60;

/**
 * POST /api/assets/analyze-pending
 * Analyses up to `batch` (default 4) not-yet-analysed images and reports how many remain.
 * The browser calls this in a loop so progress is visible and requests stay short.
 */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in to analyse media', 401);

  const body = await req.json().catch(() => ({}));
  const batch = Math.max(1, Math.min(6, Number(body?.batch) || 4));

  const { data: pending, error } = await ctx.db
    .from('media_assets')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('resource_type', 'image')
    .in('status', ['UPLOADED', 'PENDING', 'FAILED'])
    .order('created_at', { ascending: true })
    .limit(batch);
  if (error) return apiError('DATABASE_ERROR', error.message, 500);

  const results = await Promise.allSettled(
    (pending ?? []).map((p: { id: string }) => analyzeAsset(ctx.db, ctx.organizationId, p.id))
  );
  const done = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? { id: pending![i].id, error: String(r.reason?.message ?? r.reason) } : null))
    .filter(Boolean);

  const { count } = await ctx.db
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .eq('resource_type', 'image')
    .in('status', ['UPLOADED', 'PENDING', 'FAILED']);

  const providers = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.provider] : []));
  return apiOk({ done, failed, remaining: Math.max(0, (count ?? 0) - failed.length), providers });
}
