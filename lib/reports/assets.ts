import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetLite } from '@/components/report-view';
import { derive } from '@/lib/cloudinary/urls';

/** Resolve every asset id mentioned in a report's Markdown into ready-to-render Cloudinary URLs. */
export async function loadReportAssets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, 'public', any>,
  markdown: string
): Promise<Record<string, AssetLite>> {
  const ids = Array.from(new Set(markdown.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []));
  if (!ids.length) return {};
  const { data } = await db.from('media_assets').select('id, title, original_filename, cloudinary_url').in('id', ids);
  const out: Record<string, AssetLite> = {};
  for (const a of (data ?? []) as { id: string; title: string | null; original_filename: string; cloudinary_url: string }[]) {
    out[a.id] = {
      id: a.id,
      title: a.title ?? a.original_filename,
      thumb: derive(a.cloudinary_url, 'thumb'),
      full: derive(a.cloudinary_url, 'report'),
      compare: derive(a.cloudinary_url, 'compare'),
    };
  }
  return out;
}
