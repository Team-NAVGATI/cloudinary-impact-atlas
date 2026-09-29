-- ==============================================================================
-- Migration: Add missing identity record in auth.identities for GoTrue
-- In Supabase GoTrue, every email user MUST have a corresponding entry in
-- auth.identities for password authentication and user lookup to succeed.
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_identity_exists BOOLEAN;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@greenearth.org' LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM auth.identities WHERE user_id = v_user_id
        ) INTO v_identity_exists;

        IF NOT v_identity_exists THEN
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                provider_id,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                v_user_id, -- UUID type
                v_user_id,
                json_build_object('sub', v_user_id::text, 'email', 'admin@greenearth.org')::jsonb,
                'email',
                v_user_id::text,
                now(),
                now(),
                now()
            );
            RAISE NOTICE 'Created auth.identities row for user %', v_user_id;
        END IF;
    END IF;
END $$;
