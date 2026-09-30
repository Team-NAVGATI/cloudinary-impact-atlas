import { z } from 'zod';
import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { MediaAsset } from '@/lib/domain';
import { createComparison } from '@/lib/pipeline/compare';
import { ASSET_COLS } from '@/lib/columns';

export const maxDuration = 60;

const bodySchema = z.object({ beforeId: z.string().uuid(), afterId: z.string().uuid() });

/** POST /api/comparisons - store a before/after pair with an AI/rule-based change summary. */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.beforeId === parsed.data.afterId) {
    return apiError('INVALID_INPUT', 'Pick two different images', 400);
  }

  const { data } = await ctx.db
    .from('media_assets')
    .select(ASSET_COLS)
    .eq('organization_id', ctx.organizationId)
    .in('id', [parsed.data.beforeId, parsed.data.afterId]);
  const before = (data ?? []).find((a: MediaAsset) => a.id === parsed.data.beforeId) as MediaAsset | undefined;
  const after = (data ?? []).find((a: MediaAsset) => a.id === parsed.data.afterId) as MediaAsset | undefined;
  if (!before || !after) return apiError('NOT_FOUND', 'Image not found', 404);

  try {
    const cmp = await createComparison(ctx.db, { organizationId: ctx.organizationId, userId: ctx.user.id, before, after });
    return apiOk(cmp, 201);
  } catch (e) {
    return apiError('COMPARE_FAILED', e instanceof Error ? e.message : 'Could not compare', 500);
  }
}
