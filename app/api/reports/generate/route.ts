import { z } from 'zod';
import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { Zone } from '@/lib/domain';
import { buildReport } from '@/lib/reports/build';

export const maxDuration = 60;

const bodySchema = z.object({
  zoneId: z.string().uuid(),
  scenario: z
    .object({ rain24Mm: z.number().min(0).max(600), label: z.string().min(1).max(80) })
    .nullable()
    .optional(),
});

/** POST /api/reports/generate - build a Markdown situation report for a zone. */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input', 400);

  const { data: zone } = await ctx.db
    .from('zones')
    .select('*')
    .eq('id', parsed.data.zoneId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!zone) return apiError('NOT_FOUND', 'Zone not found', 404);

  try {
    const report = await buildReport({
      db: ctx.db,
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      zone: zone as Zone,
      scenario: parsed.data.scenario ?? null,
    });
    return apiOk({ id: report.id, title: report.title, risk_level: report.risk_level, risk_score: report.risk_score }, 201);
  } catch (e) {
    return apiError('REPORT_FAILED', e instanceof Error ? e.message : 'Could not generate report', 500);
  }
}
