import { IndexBar } from '@/components/index-bar';
import { LibraryClient } from '@/components/library-client';
import { SetupNeeded } from '@/components/setup-needed';
import { LinkButton, PageHeader } from '@/components/ui';
import { getSessionContext } from '@/lib/auth';
import { loadCollections } from '@/lib/collections';
import { indexProgress } from '@/lib/embeddings';

export const metadata = { title: 'Library | Impact Atlas' };
export const dynamic = 'force-dynamic';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ zone?: string }> }) {
  const ctx = (await getSessionContext())!;
  const { zone } = await searchParams;
  let collections;
  try {
    collections = await loadCollections(ctx.db, ctx.organizationId);
  } catch (e) {
    return <SetupNeeded detail={e instanceof Error ? e.message : undefined} />;
  }
  const progress = await indexProgress(ctx.db, ctx.organizationId);

  return (
    <>
      <PageHeader
        title="Library"
        description="All your evidence, grouped by the AI into smart collections. Search by what is in the picture, or open the evidence map to see the whole structure."
        actions={
          <LinkButton href="/studio" variant="primary">
            Add evidence
          </LinkButton>
        }
      />
      <div className="mb-4">
        <IndexBar {...progress} />
      </div>
      <LibraryClient collections={collections} initialZone={zone} />
    </>
  );
}
