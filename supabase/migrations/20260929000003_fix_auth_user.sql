-- ==============================================================================
-- Migration: Fix auth.users record for GoTrue compatibility
-- Note: 'confirmed_at' is a generated column in Supabase, so do not update it directly.
-- ==============================================================================

DO $$
DECLARE
    v_correct_instance_id UUID;
BEGIN
    -- 1. Find the project's real instance_id
    SELECT instance_id INTO v_correct_instance_id
    FROM auth.users
    WHERE instance_id IS NOT NULL AND instance_id != '00000000-0000-0000-0000-000000000000'
    LIMIT 1;

    -- 2. Update demo admin user
    UPDATE auth.users
    SET 
        instance_id = COALESCE(v_correct_instance_id, instance_id),
        is_sso_user = FALSE,
        is_anonymous = FALSE,
        confirmation_token = '',
        recovery_token = '',
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"full_name":"Green Earth Admin"}'::jsonb
    WHERE email = 'admin@greenearth.org';

    RAISE NOTICE 'Updated auth.users for admin@greenearth.org with instance_id=%', v_correct_instance_id;
END $$;
