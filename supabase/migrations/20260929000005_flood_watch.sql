-- ==============================================================================
-- Migration 5: Chennai Flood-Watch (evidence, zones, comparisons, reports, alerts)
-- Idempotent: safe to run more than once. Run in Supabase Dashboard > SQL Editor.
-- ==============================================================================

-- Helper: is the current user a member of an organization? (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_org_member(org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org AND user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------------------
-- 1. zones: the small, real-world area we monitor (Chennai flood-prone sites)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'LOCALITY' CHECK (kind IN ('RIVER','LAKE','MARSH','LOCALITY','COAST')),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    description TEXT,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_zones_org_slug UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_zones_org ON public.zones (organization_id);

-- ------------------------------------------------------------------------------
-- 2. contacts: authorized people who receive reports
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON public.contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_zone ON public.contacts (zone_id);

-- ------------------------------------------------------------------------------
-- 3. media_assets: traceability + flood-watch fields
-- ------------------------------------------------------------------------------
ALTER TABLE public.media_assets
    ADD COLUMN IF NOT EXISTS cloudinary_asset_id TEXT,
    ADD COLUMN IF NOT EXISTS version BIGINT,
    ADD COLUMN IF NOT EXISTS etag TEXT,
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'BASELINE',
    ADD COLUMN IF NOT EXISTS event_label TEXT,
    ADD COLUMN IF NOT EXISTS source_name TEXT,
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS license TEXT,
    ADD COLUMN IF NOT EXISTS attribution TEXT,
    ADD COLUMN IF NOT EXISTS severity SMALLINT,
    ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

DO $$ BEGIN
  ALTER TABLE public.media_assets
    ADD CONSTRAINT chk_media_assets_phase CHECK (phase IN ('BASELINE','BEFORE','DURING','AFTER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_media_assets_zone ON public.media_assets (zone_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_phase ON public.media_assets (phase);
CREATE INDEX IF NOT EXISTS idx_media_assets_search ON public.media_assets USING GIN (search_vector);
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_org_public_id
    ON public.media_assets (organization_id, cloudinary_public_id);

CREATE OR REPLACE FUNCTION public.media_assets_search_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(NEW.activity, '') || ' ' || coalesce(NEW.location, '') || ' ' ||
      coalesce(NEW.event_label, '') || ' ' || coalesce(NEW.original_filename, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_assets_search ON public.media_assets;
CREATE TRIGGER trg_media_assets_search
    BEFORE INSERT OR UPDATE ON public.media_assets
    FOR EACH ROW EXECUTE FUNCTION public.media_assets_search_update();

-- ------------------------------------------------------------------------------
-- 4. ai_analyses: which provider produced it + severity
-- ------------------------------------------------------------------------------
ALTER TABLE public.ai_analyses
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS severity SMALLINT;

-- ------------------------------------------------------------------------------
-- 5. asset_provenance: every derived URL is traceable to its original
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,              -- thumb | compare | report | story
    transformation TEXT NOT NULL,       -- e.g. c_fill,g_auto,w_800,h_600,q_auto,f_auto
    derived_url TEXT NOT NULL,
    source_version BIGINT,
    source_etag TEXT,
    used_in_type TEXT,                  -- report | comparison
    used_in_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provenance_asset ON public.asset_provenance (media_asset_id);
CREATE INDEX IF NOT EXISTS idx_provenance_used ON public.asset_provenance (used_in_type, used_in_id);

-- ------------------------------------------------------------------------------
-- 6. comparisons: before / after pairs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
    before_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    after_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    title TEXT,
    summary TEXT,
    change_score SMALLINT,              -- 0-3: none / minor / major / severe change
    provider TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comparisons_org ON public.comparisons (organization_id);

-- ------------------------------------------------------------------------------
-- 7. reports: Markdown situation reports (rendered in the app)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MODERATE','HIGH','SEVERE')),
    risk_score SMALLINT NOT NULL DEFAULT 0,
    weather JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    llm_provider TEXT,
    story_url TEXT,
    share_token TEXT NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_org ON public.reports (organization_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 8. alerts: dispatch log (who was sent which report, and how)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'EMAIL',
    status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED','SENT','FAILED')),
    error TEXT,
    sent_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_report ON public.alerts (report_id);

-- ------------------------------------------------------------------------------
-- RLS: org members can read/write within their organization
-- ------------------------------------------------------------------------------
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['zones','contacts','asset_provenance','comparisons','reports','alerts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org members select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "org members insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "org members update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "org members select" ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organization_id))', t);
    EXECUTE format('CREATE POLICY "org members insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id))', t);
    EXECUTE format('CREATE POLICY "org members update" ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))', t);
  END LOOP;
END $$;

-- Existing tables: add the write policies the app needs
DROP POLICY IF EXISTS "Members can update media assets" ON public.media_assets;
CREATE POLICY "Members can update media assets" ON public.media_assets
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Members can insert AI analyses" ON public.ai_analyses;
CREATE POLICY "Members can insert AI analyses" ON public.ai_analyses
    FOR INSERT TO authenticated
    WITH CHECK (media_asset_id IN (SELECT id FROM public.media_assets WHERE public.is_org_member(organization_id)));

DROP POLICY IF EXISTS "Members can insert media reviews" ON public.media_reviews;
CREATE POLICY "Members can insert media reviews" ON public.media_reviews
    FOR INSERT TO authenticated
    WITH CHECK (
      reviewed_by = auth.uid() AND
      media_asset_id IN (SELECT id FROM public.media_assets WHERE public.is_org_member(organization_id))
    );

-- ------------------------------------------------------------------------------
-- Seed: rename the demo organization to the Chennai scenario, add zones + contacts
-- ------------------------------------------------------------------------------
UPDATE public.organizations
   SET name = 'Chennai Flood-Watch Collective'
 WHERE name = 'Green Earth Foundation';

DO $$
DECLARE v_org UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations
   WHERE name = 'Chennai Flood-Watch Collective' ORDER BY created_at LIMIT 1;

  IF v_org IS NULL THEN
    RAISE NOTICE 'No organization found; skipping zone seed.';
    RETURN;
  END IF;

  INSERT INTO public.zones (organization_id, name, slug, kind, lat, lng, description, keywords) VALUES
    (v_org, 'Adyar River',          'adyar',        'RIVER',    13.0067, 80.2206, 'Main southern river; overflows into Saidapet, Kotturpuram and Velachery in heavy northeast monsoon.', ARRAY['adyar','saidapet','kotturpuram','foreshore','broken bridge','elphinstone','maraimalai']),
    (v_org, 'Cooum River',          'cooum',        'RIVER',    13.0715, 80.2785, 'Central river through the city; carries drain outflow and floods low-lying north-central wards.', ARRAY['cooum','koovam','napier','chepauk','island','anna salai']),
    (v_org, 'Velachery',            'velachery',    'LOCALITY', 12.9815, 80.2180, 'Low-lying residential basin that repeatedly waterlogs during heavy rain.', ARRAY['velachery','viduthalai','madipakkam','vijaya nagar']),
    (v_org, 'Pallikaranai Marsh',   'pallikaranai', 'MARSH',    12.9375, 80.2130, 'Natural sponge for south Chennai runoff; encroachment raises flood risk.', ARRAY['pallikaranai','sholinganallur','marsh','flamingo']),
    (v_org, 'Tambaram',             'tambaram',     'LOCALITY', 12.9249, 80.1000, 'Southern suburb hit by lake overflow and Adyar headwater flooding.', ARRAY['tambaram','mudichur','varadarajapuram','chembarambakkam']),
    (v_org, 'Buckingham Canal',     'buckingham',   'COAST',    13.0478, 80.2715, 'Coastal canal that drains inland water toward the sea; blockage causes backflow.', ARRAY['buckingham','canal','mylapore','mandaveli']),
    (v_org, 'North Chennai',        'north-chennai','LOCALITY', 13.1067, 80.2900, 'Dense low-lying wards near Ennore and Vyasarpadi with slow drainage.', ARRAY['ennore','vyasarpadi','tondiarpet','basin bridge','perambur'])
  ON CONFLICT (organization_id, slug) DO NOTHING;

  INSERT INTO public.contacts (organization_id, zone_id, name, designation, email, phone)
  SELECT v_org, z.id, c.name, c.designation, c.email, NULL
  FROM (VALUES
    ('adyar',        'Demo Zone Officer (Adyar)',   'Zone Officer, Greater Chennai Corporation (demo contact)', 'zone-officer-adyar@example.org'),
    ('cooum',        'Demo Zone Officer (Cooum)',   'Zone Officer, Greater Chennai Corporation (demo contact)', 'zone-officer-cooum@example.org'),
    ('velachery',    'Demo Ward Engineer',          'Assistant Executive Engineer, Storm Water Drains (demo contact)', 'ward-engineer-velachery@example.org'),
    ('pallikaranai', 'Demo Wetland Officer',        'Forest Range Officer, Pallikaranai (demo contact)', 'wetland-officer@example.org'),
    ('tambaram',     'Demo Municipal Commissioner', 'Commissioner, Tambaram Corporation (demo contact)', 'commissioner-tambaram@example.org'),
    ('buckingham',   'Demo PWD Engineer',           'Executive Engineer, Water Resources Dept (demo contact)', 'pwd-engineer@example.org'),
    ('north-chennai','Demo Zone Officer (North)',   'Zone Officer, Greater Chennai Corporation (demo contact)', 'zone-officer-north@example.org')
  ) AS c(slug, name, designation, email)
  JOIN public.zones z ON z.organization_id = v_org AND z.slug = c.slug
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts x WHERE x.organization_id = v_org AND x.email = c.email
  );
END $$;
