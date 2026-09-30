'use client';

import Link from 'next/link';
import { ArrowRight, Lightning, Stack } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export interface WorkflowStats {
  stored: number;
  analysed: number;
  organised: number;
  indexed: number;
  reviewed: number;
  compared: number;
  reports: number;
  sent: number;
  sites: number;
  contacts: number;
  askReady: boolean;
}

interface NodeDef {
  id: string;
  x: number;
  y: number;
  title: string;
  sub: string;
  layer: 'core' | 'playbook';
  metric?: (s: WorkflowStats) => string;
  what: string;
  how: string[];
  tech: string;
  href?: string;
  /** playbook nodes that extend this core node */
  extendedBy?: string;
}

const W = 168;
const H = 64;

const NODES: NodeDef[] = [
  { id: 'sources', x: 20, y: 200, title: 'Sources', sub: 'Phones, cameras, archives', layer: 'core', what: 'Anything that produces photos or video: field teams, volunteers, public archives like Wikimedia Commons.', how: ['Studio upload', 'scripts/ingest-commons.mjs'], tech: 'Browser, Wikimedia API', href: '/studio' },
  { id: 'ingest', x: 220, y: 200, title: 'Store', sub: 'Signed upload to Cloudinary', layer: 'core', metric: (s) => `${s.stored} stored`, what: 'The browser gets a one-time signature and sends the file straight to Cloudinary. The original is never edited. IDs, version and ETag are recorded for traceability.', how: ['app/api/cloudinary/signature', 'app/api/media', 'lib/cloudinary/server.ts'], tech: 'Cloudinary Upload API, Supabase', href: '/studio' },
  { id: 'understand', x: 430, y: 110, title: 'Understand', sub: 'AI reads each image', layer: 'core', metric: (s) => `${s.analysed} read`, what: 'Caption, flood severity 0 to 3, six risk signals and tags. Order: Cloudinary AI Vision, then NVIDIA Nemotron vision, then source-description rules (marked provisional).', how: ['lib/ai/vision.ts', 'lib/pipeline/analyze.ts', 'app/api/assets/[id]/analyze'], tech: 'Cloudinary AI Vision, NVIDIA Nemotron Omni', href: '/library' },
  { id: 'index', x: 430, y: 290, title: 'Index', sub: 'Meaning + look vectors', layer: 'core', metric: (s) => `${s.indexed} indexed`, what: 'Each photo gets two vectors in one space: one from its pixels, one from a contextualised description. This is what lets you search by what a picture looks like.', how: ['lib/embeddings.ts', 'app/api/index/backfill'], tech: 'NVIDIA Llama Nemotron Embed VL', href: '/library' },
  { id: 'organise', x: 640, y: 200, title: 'Organise', sub: 'Site, phase, tags, review', layer: 'core', metric: (s) => `${s.organised} placed`, what: 'Matches each item to a site by GPS or place names, groups it by phase, event and severity, and flags low-confidence results for a human to confirm.', how: ['lib/pipeline/analyze.ts', 'lib/collections.ts', 'app/api/assets/[id] (review)'], tech: 'Postgres, rules, human review', href: '/library', extendedBy: 'sites' },
  { id: 'ask', x: 850, y: 70, title: 'Ask', sub: 'Plain-language questions', layer: 'core', metric: (s) => (s.askReady ? 'Hybrid search on' : 'Keywords only'), what: 'Understands the question, searches three ways (keywords, meaning, look), merges with Reciprocal Rank Fusion, answers with numbered sources, then fact-checks its own claims.', how: ['lib/ask.ts', 'lib/retrieval.ts', 'app/api/ask'], tech: 'BM25, NVIDIA embeddings, RRF, Nemotron', href: '/ask' },
  { id: 'compare', x: 850, y: 200, title: 'Compare', sub: 'Before and after', layer: 'core', metric: (s) => `${s.compared} saved`, what: 'Two photos of the same site side by side with identical Cloudinary crops and a plain-language summary of what changed. Different sites are labelled as a reference, not a change.', how: ['components/compare-slider.tsx', 'lib/pipeline/compare.ts'], tech: 'Cloudinary c_fill,g_auto', href: '/compare' },
  { id: 'report', x: 850, y: 330, title: 'Report', sub: 'Designed Markdown', layer: 'core', metric: (s) => `${s.reports} made`, what: 'The LLM writes only the summary and findings. Everything else is generated from data into a fixed template, rendered as a designed report, and every image is traceable.', how: ['lib/reports/evidence.ts', 'lib/reports/build.ts', 'components/report-view.tsx'], tech: 'react-markdown, Cloudinary transforms', href: '/reports', extendedBy: 'risk' },
  { id: 'deliver', x: 1060, y: 200, title: 'Deliver', sub: 'Link, email, story card', layer: 'core', metric: (s) => `${s.sent} sent`, what: 'A private link, an email, or a 1080x1350 share card that Cloudinary renders from the top photo. Every send is logged.', how: ['app/api/reports/[id]/dispatch', 'app/api/reports/[id]/story', 'lib/notify/email.ts'], tech: 'Resend, Cloudinary text overlays', href: '/reports', extendedBy: 'officers' },

  { id: 'sites', x: 640, y: 30, title: 'Sites', sub: '7 Chennai flood zones', layer: 'playbook', metric: (s) => `${s.sites} sites`, what: 'The named places this playbook watches, each with coordinates and place-name keywords used to file photos automatically.', how: ['supabase/migrations/…flood_watch.sql (zones)'], tech: 'Postgres', href: '/playbooks/chennai-flood-watch' },
  { id: 'feeds', x: 430, y: 430, title: 'Live feeds', sub: 'Rainfall and river flow', layer: 'playbook', what: 'Hourly rainfall forecast and river discharge for each site, from free open data. Also powers rehearsal storms.', how: ['lib/weather/openmeteo.ts'], tech: 'Open-Meteo forecast + GloFAS', href: '/playbooks/chennai-flood-watch' },
  { id: 'risk', x: 640, y: 430, title: 'Risk engine', sub: 'Transparent 0 to 100', layer: 'playbook', what: 'Six explained parts: forecast rain by IMD class, rain probability, wet ground, river level, documented exposure, drain and garbage issues. Every point is shown.', how: ['lib/risk.ts'], tech: 'Rules, IMD rainfall classes', href: '/playbooks/chennai-flood-watch' },
  { id: 'officers', x: 1060, y: 340, title: 'Officers', sub: 'Who must know', layer: 'playbook', metric: (s) => `${s.contacts} contacts`, what: 'The people authorised to receive a site\'s report. Demo contacts use example.org addresses.', how: ['contacts table', 'app/api/reports/[id]/dispatch'], tech: 'Postgres, Resend', href: '/reports?mode=risk' },
];

const EDGES: { from: string; to: string; layer?: 'playbook'; dashed?: boolean }[] = [
  { from: 'sources', to: 'ingest' },
  { from: 'ingest', to: 'understand' },
  { from: 'ingest', to: 'index' },
  { from: 'understand', to: 'organise' },
  { from: 'index', to: 'organise' },
  { from: 'organise', to: 'ask' },
  { from: 'organise', to: 'compare' },
  { from: 'organise', to: 'report' },
  { from: 'ask', to: 'deliver', dashed: true },
  { from: 'compare', to: 'deliver' },
  { from: 'report', to: 'deliver' },
  { from: 'sites', to: 'organise', layer: 'playbook' },
  { from: 'feeds', to: 'risk', layer: 'playbook' },
  { from: 'risk', to: 'report', layer: 'playbook' },
  { from: 'officers', to: 'deliver', layer: 'playbook' },
];

const node = (id: string) => NODES.find((n) => n.id === id)!;

function edgePath(a: NodeDef, b: NodeDef) {
  const ax = a.x + W;
  const ay = a.y + H / 2;
  const bx = b.x;
  const by = b.y + H / 2;
  if (bx <= ax) {
    // vertical link (nodes stacked): connect from bottom/top edge
    const down = b.y > a.y;
    const x1 = a.x + W / 2;
    const y1 = down ? a.y + H : a.y;
    const x2 = b.x + W / 2;
    const y2 = down ? b.y : b.y + H;
    return `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
  }
  const mx = (ax + bx) / 2;
  return `M${ax} ${ay} C${mx} ${ay} ${mx} ${by} ${bx} ${by}`;
}

export function WorkflowMap({ stats, initialPlaybook }: { stats: WorkflowStats; initialPlaybook: boolean }) {
  const [playbook, setPlaybook] = useState(initialPlaybook);
  const [sel, setSel] = useState<string>('understand');
  const visible = useMemo(() => NODES.filter((n) => playbook || n.layer === 'core'), [playbook]);
  const current = node(sel);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-field border border-line bg-surface p-1" role="group" aria-label="Playbook layer">
          <button onClick={() => setPlaybook(false)} aria-pressed={!playbook} className={cn('press inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium', !playbook ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}>
            <Stack size={15} /> Generic tool
          </button>
          <button onClick={() => setPlaybook(true)} aria-pressed={playbook} className={cn('press inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium', playbook ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}>
            <Lightning size={15} /> + Chennai Flood-Watch
          </button>
        </div>
        <p className="max-w-md text-xs text-muted text-pretty">
          {playbook ? 'The playbook (amber) adds a place, live data, a risk model and named recipients to the same pipeline.' : 'The tool itself knows nothing about floods or Chennai. It stores, reads, organises, answers, compares, reports and delivers.'}
        </p>
      </div>

      <div className="dot-grid overflow-x-auto rounded-card border border-line bg-surface p-2" data-tour="workflow">
        <svg viewBox="0 0 1250 520" className="min-w-[760px] w-full" role="img" aria-label="Pipeline diagram">
          <defs>
            <marker id="wf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="var(--muted)" />
            </marker>
            <marker id="wf-arrow-pb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="var(--moderate)" />
            </marker>
            <style>{`
              @keyframes wf-flow { to { stroke-dashoffset: -24; } }
              .wf-flow { stroke-dasharray: 6 6; animation: wf-flow 1.4s linear infinite; }
              @media (prefers-reduced-motion: reduce) { .wf-flow { animation: none; } }
            `}</style>
          </defs>

          {EDGES.filter((e) => playbook || !e.layer).map((e) => {
            const a = node(e.from);
            const b = node(e.to);
            const pb = e.layer === 'playbook';
            const active = sel === e.from || sel === e.to;
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={edgePath(a, b)}
                fill="none"
                stroke={pb ? 'var(--moderate)' : 'var(--muted)'}
                strokeWidth={active ? 2.2 : 1.4}
                opacity={active ? 1 : 0.55}
                className={active ? 'wf-flow' : undefined}
                strokeDasharray={e.dashed && !active ? '3 5' : undefined}
                markerEnd={pb ? 'url(#wf-arrow-pb)' : 'url(#wf-arrow)'}
              />
            );
          })}

          {visible.map((n) => {
            const pb = n.layer === 'playbook';
            const on = sel === n.id;
            const extended = playbook && n.extendedBy;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${n.title}: ${n.sub}`}
                aria-pressed={on}
                onClick={() => setSel(n.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(n.id))}
                className="cursor-pointer outline-none"
              >
                <rect
                  width={W}
                  height={H}
                  rx={12}
                  fill={pb ? 'var(--moderate-soft)' : 'var(--surface)'}
                  stroke={on ? 'var(--accent)' : pb ? 'var(--moderate)' : 'var(--line)'}
                  strokeWidth={on ? 2.5 : 1.25}
                />
                <text x={14} y={25} fontSize="14" fontWeight="600" fill="var(--ink)">
                  {n.title}
                </text>
                <text x={14} y={43} fontSize="11" fill="var(--muted)">
                  {n.sub}
                </text>
                {n.metric && (
                  <text x={14} y={58} fontSize="10.5" fontWeight="600" fill={pb ? 'var(--moderate)' : 'var(--accent)'} fontFamily="var(--font-geist-mono)">
                    {n.metric(stats)}
                  </text>
                )}
                {extended && <circle cx={W - 10} cy={10} r={4.5} fill="var(--moderate)" />}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-live="polite">
        <section className="rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{current.title}</h2>
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', current.layer === 'playbook' ? 'bg-moderate-soft text-moderate' : 'bg-accent-soft text-accent')}>
              {current.layer === 'playbook' ? 'Playbook: Chennai Flood-Watch' : 'Generic tool'}
            </span>
            {current.metric && <span className="font-mono text-xs text-muted">{current.metric(stats)}</span>}
          </div>
          <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-muted text-pretty">{current.what}</p>
          {playbook && current.extendedBy && (
            <p className="mt-3 rounded-field bg-moderate-soft px-3 py-2 text-[13px]">
              <b>Extended by the playbook:</b> {node(current.extendedBy).title}. {node(current.extendedBy).what}
            </p>
          )}
          {current.href && (
            <Link href={current.href} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent underline">
              Open this in the app <ArrowRight size={14} />
            </Link>
          )}
        </section>
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="text-[13px] font-semibold">Where it lives</h3>
          <ul className="mt-2 space-y-1">
            {current.how.map((h) => (
              <li key={h}>
                <code className="font-mono text-xs">{h}</code>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-[13px] font-semibold">Built with</h3>
          <p className="mt-1 text-[13px] text-muted">{current.tech}</p>
        </section>
      </div>
    </div>
  );
}
