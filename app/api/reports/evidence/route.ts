import { z } from 'zod';
import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import { buildEvidenceReport } from '@/lib/reports/evidence';

export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().max(140).nullable().optional(),
  ids: z.array(z.string().uuid()).max(40).optional(),
  zone: z.string().max(40).nullable().optional(),
  phase: z.enum(['BEFORE', 'DURING', 'AFTER', 'BASELINE']).nullable().optional(),
  minSeverity: z.number().int().min(0).max(3).nullable().optional(),
  event: z.string().max(120).nullable().optional(),
  q: z.string().max(120).nullable().optional(),
});

/** POST /api/reports/evidence - a designed report for ANY selection of evidence (ids or filters). */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input', 400);
  const { title, ...scope } = parsed.data;
  try {
    const r = await buildEvidenceReport({ db: ctx.db, organizationId: ctx.organizationId, userId: ctx.user.id, scope, title });
    return apiOk({ id: r.id, title: r.title }, 201);
  } catch (e) {
    return apiError('REPORT_FAILED', e instanceof Error ? e.message : 'Could not generate report', 422);
  }
}
