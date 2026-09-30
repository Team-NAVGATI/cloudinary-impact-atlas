import Link from 'next/link';
import { ArrowRight, Drop, Leaf, Recycle, Buildings, PawPrint } from '@phosphor-icons/react/dist/ssr';
import { LinkButton, PageHeader, Panel } from '@/components/ui';

export const metadata = { title: 'Playbooks | Impact Atlas' };

const PARTS = ['Sites it watches', 'What the AI looks for', 'Live data it joins', 'How it scores', 'Who it tells'];

const PLAYBOOKS = [
  {
    id: 'chennai',
    name: 'Chennai Flood-Watch',
    icon: Drop,
    live: true,
    blurb: 'Flood evidence joined to live rainfall and river flow, scored, and sent to the officer for each zone.',
    parts: ['7 flood-prone zones (Adyar, Cooum, Velachery, Pallikaranai, Tambaram, Buckingham Canal, North Chennai)', 'Flood severity 0 to 3, blocked drains, garbage, submerged buildings, people at risk, river overflow', 'Open-Meteo rainfall forecast and GloFAS river discharge', 'Transparent 0 to 100 risk score using IMD rainfall classes', 'Zone officers and ward engineers (demo contacts)'],
  },
  {
    id: 'forest',
    name: 'Reforestation monitoring',
    icon: Leaf,
    live: false,
    blurb: 'Track planted plots over seasons and prove growth to donors.',
    parts: ['Planting plots with GPS boundaries', 'Canopy cover, sapling survival, bare soil, fire scars', 'NDVI from satellite imagery, rainfall', 'Growth index against the first-season baseline', 'Programme manager and funder'],
  },
  {
    id: 'waste',
    name: 'Waste and clean-up drives',
    icon: Recycle,
    live: false,
    blurb: 'Show a street or beach before and after a clean-up, with volumes.',
    parts: ['Streets, beaches and dump sites', 'Waste type, volume estimate, overflowing bins', 'Ward complaint feed, collection schedules', 'Cleanliness score per site', 'Sanitation inspector'],
  },
  {
    id: 'infra',
    name: 'Infrastructure inspection',
    icon: Buildings,
    live: false,
    blurb: 'Keep a dated record of cracks, corrosion and repairs on bridges and roads.',
    parts: ['Assets such as bridges, culverts and roads', 'Cracks, spalling, rust, pooling water', 'Inspection calendar, traffic counts', 'Defect severity and repair priority', 'Maintenance engineer'],
  },
  {
    id: 'wildlife',
    name: 'Wildlife camera traps',
    icon: PawPrint,
    live: false,
    blurb: 'Sort thousands of trail-camera frames by species and time.',
    parts: ['Camera stations', 'Species, count, human presence', 'Season and moon phase', 'Activity index per station', 'Range officer'],
  },
];

export default function PlaybooksPage() {
  return (
    <>
      <PageHeader
        title="Playbooks"
        description="Atlas is one general tool. A playbook adds the five things that make it useful for a specific job."
        actions={
          <LinkButton href="/workflow?playbook=chennai" variant="primary">
            See how a playbook plugs in
          </LinkButton>
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-5" aria-label="What a playbook defines">
        {PARTS.map((p, i) => (
          <div key={p} className="rounded-field border border-line bg-surface px-3 py-2 text-[13px]">
            <span className="font-mono text-xs text-accent">{i + 1}</span> <span className="font-medium">{p}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PLAYBOOKS.map((p) => {
          const I = p.icon;
          return (
            <Panel key={p.id} className={p.live ? 'border-accent/60 lg:col-span-2' : ''}>
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`grid size-9 place-items-center rounded-field ${p.live ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>
                    <I size={20} weight="fill" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold">{p.name}</h2>
                    <p className="text-xs text-muted">{p.blurb}</p>
                  </div>
                  <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-medium ${p.live ? 'bg-low-soft text-low' : 'bg-surface-2 text-muted'}`}>{p.live ? 'Live' : 'Template'}</span>
                </div>
                <dl className={`mt-4 grid gap-x-6 gap-y-2 ${p.live ? 'sm:grid-cols-2' : ''}`}>
                  {PARTS.map((label, i) => (
                    <div key={label}>
                      <dt className="text-[11px] font-medium text-muted">{label}</dt>
                      <dd className="text-[13px]">{p.parts[i]}</dd>
                    </div>
                  ))}
                </dl>
                {p.live && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <LinkButton href="/playbooks/chennai-flood-watch" variant="primary">
                      Open the monitor <ArrowRight size={14} />
                    </LinkButton>
                    <LinkButton href="/reports?mode=risk">Generate a flood-risk report</LinkButton>
                  </div>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
      <p className="mt-4 max-w-2xl text-xs text-muted text-pretty">
        Templates show what each playbook would define; only Chennai Flood-Watch is wired to live data today. Today a playbook is code plus seed data (see{' '}
        <Link href="/workflow?playbook=chennai" className="underline">
          the Workflow map
        </Link>
        ); a no-code editor is the next step.
      </p>
    </>
  );
}
