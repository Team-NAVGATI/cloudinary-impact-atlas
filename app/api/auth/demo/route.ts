import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/demo - one-click sign-in for judges and demos.
 * Enabled only when DEMO_MODE=true; the demo credentials live in server env vars, never in the browser bundle.
 */
export async function POST() {
  if (process.env.DEMO_MODE !== 'true' || !process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD) {
    return NextResponse.json({ error: 'Demo sign-in is not enabled.' }, { status: 404 });
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.DEMO_EMAIL,
    password: process.env.DEMO_PASSWORD,
  });
  if (error) return NextResponse.json({ error: 'Demo account is not available.' }, { status: 401 });
  return NextResponse.json({ status: 'ok' });
}

/** GET tells the login page whether to show the demo button. */
export async function GET() {
  return NextResponse.json({ enabled: process.env.DEMO_MODE === 'true' });
}
