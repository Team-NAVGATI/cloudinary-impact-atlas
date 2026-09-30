import { AskClient } from '@/components/ask-client';
import { SetupNeeded } from '@/components/setup-needed';
import { PageHeader } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import { loadCollections } from '@/lib/collections';
import { indexProgress } from '@/lib/embeddings';
import { IndexBar } from '@/components/index-bar';

export const metadata = { title: 'Ask | Impact Atlas' };
export const dynamic = 'force-dynamic';

export default async function AskPage({ searchParams }: { searchParams: Promise<{ about?: string; ids?: string }> }) {
  const ctx = (await getSessionContext())!;
  const sp = await searchParams;
  let c;
  try {
    c = await loadCollections(ctx.db, ctx.organizationId);
  } catch (e) {
    return <SetupNeeded detail={e instanceof Error ? e.message : undefined} />;
  }

  const progress = await indexProgress(ctx.db, ctx.organizationId);
  const site = c.sites.find((s) => s.zoneId)?.label ?? 'Velachery';
  const suggestions = [
    'Which photos show people or boats in floodwater?',
    `What does ${site} look like on a normal day compared with a flood?`,
    'Where is the flooding worst, and what shows it?',
    'How many photos do we have for each phase?',
    'Is any site at high risk in the next 24 hours?',
    'Which photos show garbage or blocked drains?',
  ];

  const ids = [sp.about, ...(sp.ids?.split(',') ?? [])].filter((x): x is string => Boolean(x && /^[0-9a-f-]{36}$/.test(x)));
  const initial = ids.length === 1 ? 'What does this photo show, and how does it compare with other evidence from the same site?' : ids.length > 1 ? 'What do these photos show together?' : undefined;

  return (
    <>
      <PageHeader title="Ask" description="Natural-language questions over your whole archive. Every answer names its sources." />
      <div className="mx-auto mb-4 max-w-4xl">
        <IndexBar {...progress} />
      </div>
      <AskClient suggestions={suggestions} initialQuestion={initial} ids={ids.length ? ids : undefined} />
    </>
  );
}
