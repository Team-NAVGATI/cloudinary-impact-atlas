import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Tables added after the generated types (zones, reports, ...) are not in `Database`,
 * so server code uses an untyped client. Row Level Security still enforces access.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, 'public', any>;

export interface SessionUser {
  id: string;
  email?: string;
}

export interface SessionContext {
  db: Db;
  user: SessionUser;
  organizationId: string;
  role: 'ADMIN' | 'MEMBER';
}

/**
 * Resolve the signed-in user and their organization (never trust a client-sent org id).
 *
 * Wrapped in React `cache()`: the layout and the page both call it in one request, and it now runs once.
 * Identity comes from `getClaims()`, which verifies the JWT locally when the project uses asymmetric signing
 * keys (falls back to the Auth server otherwise). RLS is still enforced by the database on every query.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub) return null;

  const db = supabase as unknown as Db;
  const { data: membership } = await db
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', claims.sub)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  return {
    db,
    user: { id: claims.sub, email: claims.email },
    organizationId: membership.organization_id as string,
    role: (membership.role as 'ADMIN' | 'MEMBER') ?? 'MEMBER',
  };
});

export function apiError(code: string, message: string, status: number, details?: unknown) {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

export function apiOk<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}
