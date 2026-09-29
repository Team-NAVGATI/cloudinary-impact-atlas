-- ==============================================================================
-- Script: Phase 2 Real Data Test & Verification
-- Flow:
--   1. Create user in auth.users & public.profiles
--   2. Create organization: "Green Earth Foundation"
--   3. Add user as ADMIN to organization
--   4. Create project: "Yamuna Restoration 2026"
--   5. Create dummy media asset with project_id = NULL
--   6. Assign media asset to the project
--   7. Verification query
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_project_id UUID;
    v_asset_id UUID;
BEGIN
    -- 1. Create or retrieve test user
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@greenearth.org';
    
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'admin@greenearth.org',
            crypt('Password123!', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"full_name":"Green Earth Admin"}',
            now(),
            now()
        );
    END IF;

    -- Ensure profile exists
    INSERT INTO public.profiles (id, full_name, created_at, updated_at)
    VALUES (v_user_id, 'Green Earth Admin', now(), now())
    ON CONFLICT (id) DO UPDATE SET full_name = 'Green Earth Admin';

    -- 2. Create organization: Green Earth Foundation
    INSERT INTO public.organizations (name, type)
    VALUES ('Green Earth Foundation', 'NGO')
    RETURNING id INTO v_org_id;

    -- 3. Add user to organization as ADMIN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'ADMIN')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'ADMIN';

    -- 4. Create project: Yamuna Restoration 2026
    INSERT INTO public.projects (organization_id, name, description, status)
    VALUES (
        v_org_id,
        'Yamuna Restoration 2026',
        'Ecological rejuvenation and riverbank biodiversity monitoring.',
        'ACTIVE'
    )
    RETURNING id INTO v_project_id;

    -- 5. Create dummy media asset with project_id = NULL (verifies nullable constraint)
    INSERT INTO public.media_assets (
        organization_id,
        project_id,
        cloudinary_public_id,
        cloudinary_url,
        resource_type,
        original_filename,
        title,
        status,
        created_by
    ) VALUES (
        v_org_id,
        NULL, -- Initially unassigned to any project
        'demo/test.jpg',
        'https://example.com/test.jpg',
        'image',
        'test.jpg',
        'Yamuna Initial Baseline Capture',
        'PENDING',
        v_user_id
    )
    RETURNING id INTO v_asset_id;

    -- 6. Assign the media asset to the project
    UPDATE public.media_assets
    SET project_id = v_project_id,
        updated_at = now()
    WHERE id = v_asset_id;

    RAISE NOTICE 'Test data created successfully: Org=%, Project=%, Asset=% (assigned to Project=%)',
        v_org_id, v_project_id, v_asset_id, v_project_id;
END $$;

-- 7. Verification Query: Confirm media_assets.project_id contains the project ID
SELECT 
    m.id AS asset_id,
    m.original_filename,
    m.cloudinary_public_id,
    m.project_id AS asset_project_id,
    p.id AS expected_project_id,
    p.name AS project_name,
    o.name AS organization_name,
    u.email AS created_by_user,
    om.role AS user_org_role,
    CASE 
        WHEN m.project_id = p.id THEN 'VERIFIED: media_assets.project_id contains the project ID'
        ELSE 'FAILED: mismatch'
    END AS verification_status
FROM public.media_assets m
JOIN public.projects p ON m.project_id = p.id
JOIN public.organizations o ON m.organization_id = o.id
JOIN auth.users u ON m.created_by = u.id
JOIN public.organization_members om ON om.organization_id = o.id AND om.user_id = u.id
WHERE m.original_filename = 'test.jpg'
ORDER BY m.created_at DESC
LIMIT 1;
