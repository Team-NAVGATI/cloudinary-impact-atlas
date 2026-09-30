import { apiError, apiOk, getSessionContext } from '@/lib/auth';
import { EMBED_MODEL, loadIndex } from '@/lib/embeddings';

/** GET /api/index/status - how much of the archive is searchable by meaning and by look. */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return apiError('UNAUTHORIZED', 'Sign in required', 401);
  const { vecs, persistedColumns } = await loadIndex(ctx.db, ctx.organizationId);
  const { count } = await ctx.db.from('media_assets').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organizationId).eq('resource_type', 'image').neq('status', 'ARCHIVED');
  return apiOk({ indexed: vecs.size, total: count ?? 0, persisted: persistedColumns, model: EMBED_MODEL() });
}
