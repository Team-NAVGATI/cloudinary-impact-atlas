import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { Zone } from '@/lib/domain';
import { computeRisk } from '@/lib/risk';
import { fetchWeather } from '@/lib/weather/openmeteo';

/** GET /api/weather?zoneId= - live forecast + risk score for one zone. */
export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const zoneId = new URL(req.url).searchParams.get('zoneId');
  if (!zoneId) return apiError('INVALID_INPUT', 'zoneId is required', 400);

  const { data: zone } = await ctx.db.from('zones').select('*').eq('id', zoneId).eq('organization_id', ctx.organizationId).maybeSingle();
  if (!zone) return apiError('NOT_FOUND', 'Zone not found', 404);
  const z = zone as Zone;

  try {
    const weather = await fetchWeather(z.lat, z.lng);
    const { data: assets } = await ctx.db
      .from('media_assets')
      .select('severity, id')
      .eq('organization_id', ctx.organizationId)
      .eq('zone_id', z.id)
      .eq('status', 'ANALYZED');
    const maxSeverity = (assets ?? []).reduce((m: number, a: { severity: number | null }) => Math.max(m, a.severity ?? 0), 0);
    const risk = computeRisk(weather, { maxSeverity, drainIssues: 0, count: assets?.length ?? 0 });
    return apiOk({ zone: z, weather, risk });
  } catch (e) {
    return apiError('WEATHER_UNAVAILABLE', e instanceof Error ? e.message : 'Weather unavailable', 502);
  }
}
