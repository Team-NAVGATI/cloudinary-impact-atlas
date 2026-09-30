import { getSessionContext } from '@/lib/auth';
import { derive } from '@/lib/cloudinary/urls';
import { slugify } from '@/lib/utils';

/** GET /api/reports/:id/markdown - standalone .md download with real image URLs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: report } = await ctx.db.from('reports').select('*').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (!report) return new Response('Not found', { status: 404 });

  const ids = Array.from(new Set(Array.from((report.content_markdown as string).matchAll(/asset:\/\/([0-9a-f-]{36})/g)).map((m) => m[1])));
  const { data: assets } = ids.length
    ? await ctx.db.from('media_assets').select('id, cloudinary_url').in('id', ids)
    : { data: [] as { id: string; cloudinary_url: string }[] };
  const urlById = new Map((assets ?? []).map((a: { id: string; cloudinary_url: string }) => [a.id, derive(a.cloudinary_url, 'report')]));

  const md = (report.content_markdown as string).replace(/asset:\/\/([0-9a-f-]{36})/g, (_m, aid) => urlById.get(aid) ?? '');
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slugify(report.title as string).slice(0, 60)}.md"`,
    },
  });
}
