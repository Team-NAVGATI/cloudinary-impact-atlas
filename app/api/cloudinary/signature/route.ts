import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateUploadSignature, isCloudinaryConfigured } from '@/lib/cloudinary/server';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Authenticate user
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
            message: 'Authentication required to generate upload signature',
          },
        },
        { status: 401 }
      );
    }

    // 2. Resolve user's organization
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
            message: 'You must belong to an organization to upload media',
          },
        },
        { status: 403 }
      );
    }

    // 3. Verify Cloudinary configuration
    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CLOUDINARY_NOT_CONFIGURED',
            message: 'Cloudinary credentials are not configured on the server',
          },
        },
        { status: 503 }
      );
    }

    // 4. Generate signature
    const signatureData = generateUploadSignature(membership.organization_id);

    return NextResponse.json({
      success: true,
      data: signatureData,
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
