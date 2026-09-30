import { z } from 'zod';
import { apiError, apiOk, getSessionContext } from '@/lib/auth';

const patchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    zone_id: z.string().uuid().nullable().optional(),
    phase: z.enum(['BASELINE', 'BEFORE', 'DURING', 'AFTER']).optional(),
    tags: z.array(z.string().min(1).max(40)).max(30).optional(),
    review: z.object({ action: z.enum(['CONFIRMED', 'CORRECTED', 'REJECTED']), notes: z.string().max(1000).optional() }).optional(),
  })
  .strict();

/** PATCH /api/assets/:id - human review: correct zone / phase / tags and log the review. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input', 400);
  const { review, ...fields } = parsed.data;

  if (Object.keys(fields).length) {
    const { error } = await ctx.db
      .from('media_assets')
      .update({ ...fields, ...(fields.tags ? { tags: fields.tags.map((t) => t.toLowerCase()) } : {}) })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);
    if (error) return apiError('DATABASE_ERROR', error.message, 500);
  }
  if (review) {
    const { error } = await ctx.db.from('media_reviews').insert({
      media_asset_id: id,
      reviewed_by: ctx.user.id,
      action: review.action,
      notes: review.notes ?? null,
    });
    if (error) return apiError('DATABASE_ERROR', error.message, 500);
  }
  return apiOk({ id });
}
