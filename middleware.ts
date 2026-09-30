import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Only the signed-in pages and /login need session handling. Public pages (landing, guide, architecture,
// shared reports) and API routes (which authenticate themselves) never pay for an auth check here.
export const config = {
  matcher: [
    '/login',
    '/dashboard/:path*',
    '/studio/:path*',
    '/library/:path*',
    '/ask/:path*',
    '/upload/:path*',
    '/compare/:path*',
    '/reports/:path*',
    '/assets/:path*',
    '/workflow/:path*',
    '/playbooks/:path*',
  ],
};
