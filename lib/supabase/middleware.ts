import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database.types';

/** Signed-in areas. Everything else (landing, guide, architecture, shared reports, API routes) skips this middleware. */
export const PROTECTED_PREFIXES = ['/dashboard', '/studio', '/library', '/ask', '/upload', '/compare', '/reports', '/assets', '/workflow', '/playbooks'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  let signedIn = false;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          },
        },
      });

      // getClaims() verifies the JWT locally when the project uses asymmetric signing keys (no network round trip)
      // and refreshes an expired session; with a legacy shared secret it falls back to asking the Auth server.
      const { data } = await supabase.auth.getClaims();
      signedIn = Boolean(data?.claims?.sub);
    } catch {
      signedIn = false; // misconfigured or unreachable auth: treat as signed out rather than crash every page
    }
  }

  if (isProtected && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/studio';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
