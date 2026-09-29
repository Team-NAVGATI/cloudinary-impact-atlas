import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          status: 'pending_service_key',
          message:
            'SUPABASE_SERVICE_ROLE_KEY is not yet set in .env.local. Because Row Level Security (RLS) is active on media_assets, server-side admin queries require the service_role key to bypass user RLS policies.',
          instructions:
            'Retrieve your service_role key from Supabase Dashboard -> Project Settings -> API, add it to .env.local as SUPABASE_SERVICE_ROLE_KEY=..., and re-run this endpoint.',
        },
        { status: 403 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const { data: assets, error } = await supabase
      .from('media_assets')
      .select(`
        id,
        original_filename,
        cloudinary_public_id,
        cloudinary_url,
        project_id,
        status,
        created_at,
        projects (
          id,
          name,
          status
        ),
        organizations (
          id,
          name
        )
      `)
      .eq('original_filename', 'test.jpg');

    if (error) {
      return NextResponse.json(
        { status: 'error', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      count: assets?.length || 0,
      records: assets,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
