import { SetupNeeded } from '@/components/setup-needed';
import { PageHeader } from '@/components/ui';
import { WorkflowMap, type WorkflowStats } from '@/components/workflow-map';
import { getSessionContext } from '@/lib/auth';
import { loadCollections } from '@/lib/collections';
import { isNvidiaConfigured } from '@/lib/ai/nvidia';
import { loadIndex } from '@/lib/embeddings';

export const metadata = { title: 'Workflow | Impact Atlas' };
export const dynamic = 'force-dynamic';

export default async function WorkflowPage({ searchParams }: { searchParams: Promise<{ playbook?: string }> }) {
  const ctx = (await getSessionContext())!;
  const { db, organizationId: org } = ctx;
  const sp = await searchParams;

  let c;
  try {
    c = await loadCollections(db, org);
  } catch (e) {
    return <SetupNeeded detail={e instanceof Error ? e.message : undefined} />;
  }
  const [{ vecs }, { count: reviewed }, { count: compared }, { count: reports }, { count: sent }, { count: contacts }, { count: sites }] = await Promise.all([
    loadIndex(db, org),
    db.from('media_reviews').select('id', { count: 'exact', head: true }),
    db.from('comparisons').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('alerts').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('zones').select('id', { count: 'exact', head: true }).eq('organization_id', org),
  ]);

  const stats: WorkflowStats = {
    stored: c.total,
    analysed: c.analysed,
    organised: c.total - (c.sites.find((s) => s.zoneId === null)?.count ?? 0),
    indexed: vecs.size,
    reviewed: reviewed ?? 0,
    compared: compared ?? 0,
    reports: reports ?? 0,
    sent: sent ?? 0,
    sites: sites ?? 0,
    contacts: contacts ?? 0,
    askReady: isNvidiaConfigured() && vecs.size > 0,
  };

  return (
    <>
      <PageHeader
        title="Workflow"
        description="How a photo becomes evidence, and how a playbook like Chennai Flood-Watch plugs into the same pipeline. Click any step."
      />
      <WorkflowMap stats={stats} initialPlaybook={sp.playbook === 'chennai'} />
    </>
  );
}
