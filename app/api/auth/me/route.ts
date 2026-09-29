import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { authenticated: false, message: 'No active session.' },
        { status: 401 }
      );
    }

    // 1. Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    // 2. Fetch organization membership
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    let organizationName = 'Unknown Organization';
    if (membership?.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', membership.organization_id)
        .maybeSingle();
      if (org?.name) {
        organizationName = org.name;
      }
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: profile || null,
      membership: membership
        ? {
            organization_id: membership.organization_id,
            organization_name: organizationName,
            role: membership.role, // 'ADMIN' or 'MEMBER'
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
