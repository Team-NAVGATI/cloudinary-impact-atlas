/**
 * Columns of `media_assets` that the app reads. Deliberately excludes `search_vector` (tsvector), `emb_img` / `emb_txt`
 * (about 2.7 KB of base64 each) and `phash`, so list queries stay small. `select('*')` on this table would drag every
 * vector over the wire on every Library, Ask and report request.
 */
const COLS = [
  'id',
  'organization_id',
  'zone_id',
  'cloudinary_public_id',
  'cloudinary_asset_id',
  'cloudinary_url',
  'version',
  'etag',
  'resource_type',
  'original_filename',
  'mime_type',
  'file_size',
  'width',
  'height',
  'title',
  'description',
  'activity',
  'location',
  'captured_at',
  'lat',
  'lng',
  'tags',
  'status',
  'phase',
  'event_label',
  'source_name',
  'source_url',
  'license',
  'attribution',
  'severity',
  'analyzed_at',
  'created_at',
].join(', ');

/**
 * Typed as '*' on purpose: the Supabase client here is untyped (`Db`), and a non-literal column string would make
 * every row `GenericStringError`. At runtime this is the explicit column list above, never `*`.
 */
export const ASSET_COLS = COLS as unknown as '*';

/** Same columns plus the latest AI analysis and reviews, for list views that show "Needs review". */
export const ASSET_COLS_WITH_REVIEW = `${COLS}, ai_analyses(provider, confidence, created_at), media_reviews(action)` as unknown as '*';
