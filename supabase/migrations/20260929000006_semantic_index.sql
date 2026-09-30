-- ==============================================================================
-- Migration 6: semantic index (multimodal embeddings) + content fingerprint
-- Idempotent. Run in Supabase Dashboard > SQL Editor.
--
-- Vectors are stored int8-quantised and base64-encoded (about 2.7 KB each instead of 16 KB of floats).
-- At this scale, similarity is computed in the app; for millions of items, move to pgvector `halfvec`
-- with an HNSW index (2048 dims exceeds the 2000-dim limit of `vector`, but `halfvec` supports up to 4000).
-- ==============================================================================

ALTER TABLE public.media_assets
    ADD COLUMN IF NOT EXISTS emb_img TEXT,         -- embedding of the pixels (multimodal model)
    ADD COLUMN IF NOT EXISTS emb_txt TEXT,         -- embedding of contextualised metadata text
    ADD COLUMN IF NOT EXISTS emb_model TEXT,
    ADD COLUMN IF NOT EXISTS emb_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS phash TEXT;           -- perceptual hash (Cloudinary) to spot duplicates

CREATE INDEX IF NOT EXISTS idx_media_assets_phash ON public.media_assets (phash) WHERE phash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_emb_pending ON public.media_assets (organization_id) WHERE emb_at IS NULL;
