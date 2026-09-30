import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Nav } from '@/components/nav';
import { getSessionContext } from '@/lib/auth';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const { data: org } = await ctx.db.from('organizations').select('name').eq('id', ctx.organizationId).maybeSingle();

  return (
    <div className="min-h-dvh">
      <Nav orgName={org?.name ?? 'Organization'} email={ctx.user.email ?? ''} />
      <main id="main" className="min-w-0 px-4 py-6 lg:pl-[17rem] lg:pr-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
