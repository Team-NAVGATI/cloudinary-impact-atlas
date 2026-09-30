import { z } from 'zod';
import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { Contact, Report, Zone } from '@/lib/domain';
import { buildEmail, isEmailConfigured, sendEmail } from '@/lib/notify/email';
import { siteOrigin } from '@/lib/site';

const bodySchema = z.object({ contactIds: z.array(z.string().uuid()).min(1).max(10) });

/**
 * POST /api/reports/:id/dispatch
 * Sends the report link to authorised contacts. With RESEND_API_KEY it emails them; otherwise it records a
 * PREPARED alert (and returns the share link) so nothing is silently dropped.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_INPUT', 'Choose at least one recipient', 400);

  const { data: report } = await ctx.db.from('reports').select('*').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (!report) return apiError('NOT_FOUND', 'Report not found', 404);
  const r = report as Report;

  const { data: zone } = r.zone_id ? await ctx.db.from('zones').select('*').eq('id', r.zone_id).maybeSingle() : { data: null };
  const { data: contacts } = await ctx.db
    .from('contacts')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('active', true)
    .in('id', parsed.data.contactIds);
  if (!contacts?.length) return apiError('NOT_FOUND', 'No matching contacts', 404);

  const origin = siteOrigin(req);
  const link = `${origin}/r/${r.share_token}`;

  const results = [];
  for (const c of contacts as Contact[]) {
    const mail = buildEmail(r, zone as Zone | null, link, c.name);
    const res = await sendEmail(c.email, mail);
    const { error } = await ctx.db.from('alerts').insert({
      organization_id: ctx.organizationId,
      report_id: r.id,
      contact_id: c.id,
      recipient_email: c.email,
      channel: 'EMAIL',
      status: res.status,
      error: res.error ?? null,
      sent_by: ctx.user.id,
    });
    results.push({
      contact: c.name,
      email: c.email,
      status: res.status,
      error: res.error,
      saved: !error,
      mailto: `mailto:${c.email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.text)}`,
    });
  }
  return apiOk({ link, emailConfigured: isEmailConfigured(), results });
}
