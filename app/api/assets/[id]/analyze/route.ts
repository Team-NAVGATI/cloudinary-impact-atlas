import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import { analyzeAsset } from '@/lib/pipeline/analyze';

export const maxDuration = 60;

/**
 * POST /api/assets/:id/analyze
 * Default: one JSON response when finished.
 * With ?stream=1: newline-delimited JSON events ({type:'step'|'done'|'error'}) so the Studio can show real progress.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in to analyse media', 401);
  const { id } = await params;
  const stream = new URL(req.url).searchParams.get('stream') === '1';

  if (!stream) {
    try {
      return apiOk(await analyzeAsset(ctx.db, ctx.organizationId, id));
    } catch (e) {
      return apiError('ANALYSIS_FAILED', e instanceof Error ? e.message : 'Analysis failed', 500);
    }
  }

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const t0 = Date.now();
      try {
        const outcome = await analyzeAsset(ctx.db, ctx.organizationId, id, (step, data) =>
          send({ type: 'step', step, ms: Date.now() - t0, data })
        );
        send({ type: 'done', ms: Date.now() - t0, data: outcome });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Analysis failed' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
