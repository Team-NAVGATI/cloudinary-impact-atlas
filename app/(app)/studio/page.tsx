import { GetStarted } from '@/components/get-started';
import { SetupNeeded } from '@/components/setup-needed';
import { StudioClient, type SampleAsset } from '@/components/studio-client';
import { Tour, TourButton, type TourStep } from '@/components/tour';
import { getSessionContext } from '@/lib/auth';
import { derive } from '@/lib/cloudinary/urls';

export const metadata = { title: 'Studio | Impact Atlas' };
export const dynamic = 'force-dynamic';

const TOUR: TourStep[] = [
  { title: 'Welcome to the Studio', body: 'This is where evidence comes in. Everything happens on this one screen: add a file on the left, watch it turn into evidence on the right.' },
  { target: '[data-tour="drop"]', title: 'Add photos or video', body: 'Drop files here. They go straight to Cloudinary using a one-time signed permission, so your originals are stored untouched.' },
  { target: '[data-tour="samples"]', title: 'No file? Use a sample', body: 'Pick one of the real Chennai photos to see the whole pipeline in about ten seconds.' },
  { target: '[data-tour="nav-library"]', title: 'Everything lands in the Library', body: 'Smart collections group evidence by site, phase and severity. An evidence map shows how it is organised.' },
  { target: '[data-tour="nav-ask"]', title: 'Ask in plain language', body: 'Try "Where did water reach the roofs last monsoon?" Answers cite the photos they came from.' },
  { target: '[data-tour="nav-reports"]', title: 'Turn evidence into a report', body: 'Pick any set of photos and get a designed, printable report you can send with a private link.' },
  { target: '[data-tour="checklist"]', title: 'Your checklist', body: 'Six steps from first photo to a sent report. It ticks itself off as you go.' },
];

export default async function StudioPage() {
  const ctx = (await getSessionContext())!;
  const { db, organizationId: org } = ctx;

  // One round of parallel queries (was: zones first, then six more).
  const [{ data: zones, error }, { count: assets }, { count: analysed }, { count: comparisons }, { count: reports }, { count: alerts }, { data: pool }] = await Promise.all([
    db.from('zones').select('id, name').eq('organization_id', org).order('name'),
    db.from('media_assets').select('id', { count: 'exact', head: true }).eq('organization_id', org).neq('status', 'ARCHIVED'),
    db.from('media_assets').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'ANALYZED'),
    db.from('comparisons').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('alerts').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db
      .from('media_assets')
      .select('id, title, phase, severity, cloudinary_url')
      .eq('organization_id', org)
      .eq('status', 'ANALYZED')
      .in('phase', ['BEFORE', 'DURING'])
      .order('severity', { ascending: false, nullsFirst: false })
      .limit(60),
  ]);
  if (error) return <SetupNeeded detail={error.message} />;

  // Three varied samples: two strong flood photos and one normal-day photo.
  // Ground-level photos only: skip satellite / weather-map imagery, which makes a confusing first demo.
  const NOT_A_PHOTO = /\d{4}Z|MODIS|CIRA|Copernicus|\bpath\b|satellite|infrared/i;
  const rows = ((pool ?? []) as { id: string; title: string | null; phase: string; severity: number | null; cloudinary_url: string }[]).filter((r) => !NOT_A_PHOTO.test(r.title ?? ''));
  const picks = [...rows.filter((r) => r.phase === 'DURING' && (r.severity ?? 0) >= 3).slice(0, 2), ...rows.filter((r) => r.phase === 'BEFORE').slice(0, 1)];
  const samples: SampleAsset[] = picks.map((r) => ({
    id: r.id,
    title: r.title ?? 'Chennai photo',
    original: r.cloudinary_url,
    thumb: derive(r.cloudinary_url, 'thumb'),
    phase: r.phase,
  }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Studio</h1>
          <p className="mt-0.5 text-[13px] text-muted">Add evidence and watch it get read, filed and indexed.</p>
        </div>
        <div className="flex items-center gap-2">
          <TourButton />
          <GetStarted
            progress={{
              uploaded: (assets ?? 0) > 0,
              analysed: (analysed ?? 0) > 0,
              compared: (comparisons ?? 0) > 0,
              reported: (reports ?? 0) > 0,
              sent: (alerts ?? 0) > 0,
            }}
          />
        </div>
      </div>
      <StudioClient zones={zones ?? []} samples={samples} hasData={(assets ?? 0) > 0} />
      <Tour steps={TOUR} />
    </>
  );
}
