-- ==============================================================================
-- Migration: Phase 2 Database Schema
-- Description: Core tables for Sustainability Media Intelligence Platform
-- Tables:
--   1. organizations
--   2. profiles
--   3. organization_members
--   4. projects
--   5. media_assets
--   6. ai_analyses
--   7. media_reviews
-- ==============================================================================

-- 1. Ensure UUID generation extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- Function: Auto-update updated_at timestamp
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 1. Table: organizations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'NGO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 2. Table: profiles
-- References auth.users(id) directly
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatic profile row creation trigger when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. Table: organization_members
-- Maps auth.users to organizations with role and unique constraint
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_organization_members_org_user UNIQUE (organization_id, user_id)
);

-- Indexes for organization_members
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members (organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members (user_id);

-- ==============================================================================
-- 4. Table: projects
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects (organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status);

-- ==============================================================================
-- 5. Table: media_assets
-- project_id is nullable (asset can exist before assignment to a project)
-- Media binaries are stored in Cloudinary; only URLs & metadata are kept here
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    cloudinary_public_id TEXT NOT NULL,
    cloudinary_url TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'image',
    original_filename TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT,
    width INTEGER,
    height INTEGER,
    title TEXT,
    description TEXT,
    activity TEXT,
    location TEXT,
    captured_at TIMESTAMPTZ,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER trg_media_assets_updated_at
    BEFORE UPDATE ON public.media_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes for media_assets
CREATE INDEX IF NOT EXISTS idx_media_assets_organization_id ON public.media_assets (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_project_id ON public.media_assets (project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_by ON public.media_assets (created_by);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON public.media_assets (status);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON public.media_assets USING GIN (tags);

-- ==============================================================================
-- 6. Table: ai_analyses
-- Stores inferences from vision models (NVIDIA AI APIs in upcoming phase)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    description TEXT,
    suggested_activity TEXT,
    suggested_location TEXT,
    suggested_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    objects JSONB NOT NULL DEFAULT '[]'::jsonb,
    environmental_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags TEXT[] NOT NULL DEFAULT '{}',
    confidence DOUBLE PRECISION,
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for ai_analyses
CREATE INDEX IF NOT EXISTS idx_ai_analyses_media_asset_id ON public.ai_analyses (media_asset_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_suggested_project_id ON public.ai_analyses (suggested_project_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_tags ON public.ai_analyses USING GIN (tags);

-- ==============================================================================
-- 7. Table: media_reviews
-- Audit trail of human review actions for sustainability media
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.media_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    reviewed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for media_reviews
CREATE INDEX IF NOT EXISTS idx_media_reviews_media_asset_id ON public.media_reviews (media_asset_id);
CREATE INDEX IF NOT EXISTS idx_media_reviews_reviewed_by ON public.media_reviews (reviewed_by);

-- ==============================================================================
-- Enable Row Level Security (RLS) on all public tables
-- ==============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_reviews ENABLE ROW LEVEL SECURITY;

-- Basic initial baseline RLS policies for authenticated users
-- Profiles: Users can view and update their own profile
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid());

-- Organization Members: Members can view their organization memberships
CREATE POLICY "Users can view their organization memberships"
    ON public.organization_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Organizations: Members can view organizations they belong to
CREATE POLICY "Members can view their organizations"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Projects: Members can view projects within their organizations
CREATE POLICY "Members can view projects in their organizations"
    ON public.projects FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Media Assets: Members can view media assets in their organizations
CREATE POLICY "Members can view media assets in their organizations"
    ON public.media_assets FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Members can insert media assets into their organizations"
    ON public.media_assets FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid() AND
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

-- AI Analyses: Members can view analyses for media assets in their organizations
CREATE POLICY "Members can view AI analyses of their organization assets"
    ON public.ai_analyses FOR SELECT
    TO authenticated
    USING (
        media_asset_id IN (
            SELECT id
            FROM public.media_assets
            WHERE organization_id IN (
                SELECT organization_id
                FROM public.organization_members
                WHERE user_id = auth.uid()
            )
        )
    );

-- Media Reviews: Members can view reviews for media assets in their organizations
CREATE POLICY "Members can view reviews of their organization assets"
    ON public.media_reviews FOR SELECT
    TO authenticated
    USING (
        media_asset_id IN (
            SELECT id
            FROM public.media_assets
            WHERE organization_id IN (
                SELECT organization_id
                FROM public.organization_members
                WHERE user_id = auth.uid()
            )
        )
    );
