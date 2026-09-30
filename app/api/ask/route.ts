import { z } from 'zod';
import { apiError, getSessionContext } from '@/lib/auth';
import { judgeClaims, planQuestion, retrieve, writeAnswer } from '@/lib/ask';
import type { Zone } from '@/lib/domain';

export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().min(3).max(400),
  ids: z.array(z.string().uuid()).max(30).optional(),
});

/**
 * POST /api/ask  ->  newline-delimited JSON events:
 *   {type:'step', id, status:'active'|'done', detail}   plan / retrieve / read
 *   {type:'evidence', items}                            cards with images, licence and credit
 *   {type:'answer', markdown, followups, cited, by}
 *   {type:'done', ms} | {type:'error', message}
 */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_INPUT', 'Type a question of at least a few words', 400);
  const { question, ids } = parsed.data;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const t0 = Date.now();
      try {
        const { data: zoneRows } = await ctx.db.from('zones').select('*').eq('organization_id', ctx.organizationId);
        const zones = (zoneRows ?? []) as Zone[];

        send({ type: 'step', id: 'plan', status: 'active', detail: 'Working out what you are asking…' });
        const plan = ids?.length ? { ...(await planQuestion(question, zones)), keywords: [] as string[] } : await planQuestion(question, zones);
        const bits = [
          plan.zoneName && `site: ${plan.zoneName}`,
          plan.phase && `phase: ${plan.phase.toLowerCase()}`,
          plan.minSeverity !== null && `severity ${plan.minSeverity}+`,
          plan.keywords.length > 0 && `looking for: ${plan.keywords.join(', ')}`,
          plan.needsWeather && 'needs live weather',
        ].filter(Boolean);
        send({ type: 'step', id: 'plan', status: 'done', ms: Date.now() - t0, detail: ids?.length ? `Using your ${ids.length} selected item${ids.length === 1 ? '' : 's'}` : bits.join(' · ') || 'General question', by: plan.by });

        const t1 = Date.now();
        send({ type: 'step', id: 'retrieve', status: 'active', detail: 'Searching the archive…' });
        const data = await retrieve(ctx.db, ctx.organizationId, plan, zones, ids ?? [], question);
        send({
          type: 'step',
          id: 'retrieve',
          status: 'done',
          ms: Date.now() - t1,
          detail: `${data.evidence.length} of ${data.trace.candidates} items via ${data.trace.meaningHits !== null ? 'keywords + meaning + visual' : 'keywords'}${data.weather.length ? `, ${data.weather.length} live forecast${data.weather.length === 1 ? '' : 's'}` : ''}${data.reports.length ? `, ${data.reports.length} report${data.reports.length === 1 ? '' : 's'}` : ''}`,
        });
        send({ type: 'evidence', items: data.evidence, trace: data.trace, plan });

        const t2 = Date.now();
        send({ type: 'step', id: 'read', status: 'active', detail: 'Reading the evidence and writing an answer…' });
        const answer = await writeAnswer(question, plan, data);
        send({ type: 'step', id: 'read', status: 'done', ms: Date.now() - t2, detail: answer.by === 'llm' ? `${answer.model?.split('/').pop()}: ${answer.cited.length} source${answer.cited.length === 1 ? '' : 's'} cited, ${answer.grounding.status === 'verified' ? 'grounding verified' : 'needs review'}` : 'Answered from rules (AI unavailable)' });
        send({ type: 'answer', ...answer });
        if (answer.by === 'llm') {
          const checks = await judgeClaims(answer.markdown, data.evidence);
          if (checks) send({ type: 'verification', claims: checks });
        }
        send({ type: 'done', ms: Date.now() - t0 });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
