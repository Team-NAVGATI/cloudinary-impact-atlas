import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import type { MediaAsset } from '@/lib/domain';
import { ASSET_COLS_WITH_REVIEW } from '@/lib/columns';

/**
 * GET /api/search?q=&zone=&phase=&minSeverity=&limit=
 * Full-text search over title, AI tags/caption, description, event and location (weighted tsvector),
 * with a fuzzy ILIKE fallback so partial words still match.
 */
export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);

  const p = new URL(req.url).searchParams;
  const q = (p.get('q') ?? '').trim().slice(0, 120);
  const zone = p.get('zone');
  const phase = p.get('phase');
  const event = p.get('event');
  const tag = p.get('tag');
  const ids = (p.get('ids') ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 60);
  const minSeverity = Number(p.get('minSeverity') ?? '');
  const limit = Math.max(1, Math.min(120, Number(p.get('limit')) || 60));

  const base = () => {
    let query = ctx.db.from('media_assets').select(ASSET_COLS_WITH_REVIEW).eq('organization_id', ctx.organizationId).neq('status', 'ARCHIVED');
    if (zone === 'none') query = query.is('zone_id', null);
    else if (zone) query = query.eq('zone_id', zone);
    if (phase) query = query.eq('phase', phase);
    if (event) query = query.eq('event_label', event);
    if (tag) query = query.contains('tags', [tag.toLowerCase()]);
    if (ids.length) query = query.in('id', ids);
    if (Number.isFinite(minSeverity) && p.get('minSeverity')) query = query.gte('severity', minSeverity);
    return query;
  };

  let mode: 'all' | 'fulltext' | 'fuzzy' = 'all';
  let rows: MediaAsset[] = [];

  if (!q) {
    const { data, error } = await base().order('severity', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(limit);
    if (error) return apiError('DATABASE_ERROR', error.message, 500);
    rows = (data ?? []) as MediaAsset[];
  } else {
    const ft = await base().textSearch('search_vector', q, { type: 'websearch', config: 'english' }).limit(limit);
    if (ft.error) return apiError('DATABASE_ERROR', ft.error.message, 500);
    rows = (ft.data ?? []) as MediaAsset[];
    mode = 'fulltext';
    if (rows.length < 3) {
      const safe = q.replace(/[,()%*]/g, ' ').trim();
      const fz = await base()
        .or(`title.ilike.%${safe}%,description.ilike.%${safe}%,location.ilike.%${safe}%,event_label.ilike.%${safe}%`)
        .limit(limit);
      if (!fz.error && fz.data?.length) {
        const seen = new Set(rows.map((r) => r.id));
        rows = [...rows, ...(fz.data as MediaAsset[]).filter((r) => !seen.has(r.id))];
        mode = 'fuzzy';
      }
    }
  }
  // Human-in-the-loop signal: low-confidence AI results that nobody has confirmed yet need a look.
  type Row = MediaAsset & { ai_analyses?: { provider: string; confidence: number | null; created_at: string }[]; media_reviews?: { action: string }[] };
  const results = (rows as Row[]).map((r) => {
    const latest = [...(r.ai_analyses ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const reviewed = (r.media_reviews ?? []).some((m) => m.action === 'CONFIRMED' || m.action === 'CORRECTED');
    const { ai_analyses: _a, media_reviews: _m, ...rest } = r;
    return { ...rest, ai_provider: latest?.provider ?? null, ai_confidence: latest?.confidence ?? null, reviewed, needs_review: r.status === 'ANALYZED' && !reviewed && (latest?.confidence ?? 1) < 0.6 };
  });
  return apiOk({ query: q, mode, count: results.length, results });
}
