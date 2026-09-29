import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createMediaAssetSchema } from '@/lib/validations/media';

/**
 * POST /api/media
 * Validates Cloudinary upload metadata and persists media_assets record.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Require authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required to create media assets',
          },
        },
        { status: 401 }
      );
    }

    // 2. Determine user's organization from membership (Never trust client organization_id)
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_ORGANIZATION',
            message: 'User does not belong to any active organization',
          },
        },
        { status: 403 }
      );
    }

    // 3. Validate request body using Zod
    const body = await request.json();
    const validationResult = createMediaAssetSchema.safeParse(body);

    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_METADATA',
            message: firstIssue?.message || 'Invalid media metadata submitted',
            details: validationResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const validData = validationResult.data;

    // 4. Verify public_id format matches organization folder pattern
    // Pattern: organizations/{org_id}/media/...
    const expectedFolderPrefix = `organizations/${membership.organization_id}/media/`;
    if (!validData.cloudinary_public_id.startsWith(expectedFolderPrefix)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PUBLIC_ID',
            message: `cloudinary_public_id must belong to your organization folder (${expectedFolderPrefix})`,
          },
        },
        { status: 400 }
      );
    }

    // 5. Create media_assets record
    // project_id is explicitly NULL initially.
    // status is set to UPLOADED.
    // organization_id is bound to user's membership.
    // created_by is bound to authenticated user.
    const { data: newAsset, error: insertError } = await supabase
      .from('media_assets')
      .insert({
        organization_id: membership.organization_id,
        project_id: null,
        cloudinary_public_id: validData.cloudinary_public_id,
        cloudinary_url: validData.cloudinary_url,
        resource_type: validData.resource_type,
        original_filename: validData.original_filename,
        mime_type: validData.mime_type || null,
        file_size: validData.file_size || null,
        width: validData.width || null,
        height: validData.height || null,
        status: 'UPLOADED',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: insertError.message || 'Failed to save media asset to database',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: newAsset,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/media
 * Lists media assets for the current authenticated user's organization.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_ORGANIZATION',
            message: 'User does not belong to any organization',
          },
        },
        { status: 403 }
      );
    }

    const { data: assets, error: fetchError } = await supabase
      .from('media_assets')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: fetchError.message,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: assets || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
