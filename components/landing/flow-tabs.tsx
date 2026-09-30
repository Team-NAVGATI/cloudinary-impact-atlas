'use client';

import { CheckCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { EvidenceMap } from '@/components/evidence-map';
import { PipelineSteps } from '@/components/pipeline';
import { RiskMeter } from '@/components/risk-blocks';
import { Badge, SeverityChip } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface FlowCounts {
  sites: [string, number][];
}

export interface FlowImages {
  roof: string;
  boats: string;
  street: string;
  vehicles: string;
  story: string;
}

const STEPS = [
  { id: 'add', title: 'Add', blurb: 'Drop photos or video. They go straight to Cloudinary, untouched.' },
  { id: 'understand', title: 'Understand', blurb: 'AI writes a caption, rates severity and spots the risks.' },
  { id: 'organise', title: 'Organise', blurb: 'Sorted by site, phase and event. Nothing filed by hand.' },
  { id: 'ask', title: 'Ask', blurb: 'Plain questions get answers with the photos attached.' },
  { id: 'report', title: 'Report', blurb: 'A designed report and a share card, sent to whoever must act.' },
];

function buildMap(sites: [string, number][]) {
  const sev = (name: string) => (/city|velachery/i.test(name) ? (/velachery/i.test(name) ? 3 : 2.3) : 0.3);
  return sites.map(([name, n], i) => ({
    zoneId: `s${i}`,
    name,
    total: n,
    leaves: [{ phase: /city|velachery/i.test(name) ? 'DURING' : 'BEFORE', count: n, avgSeverity: sev(name) }],
  }));
}

export function FlowTabs({ images, counts }: { images: FlowImages; counts: FlowCounts }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    timer.current = setInterval(() => setI((n) => (n + 1) % STEPS.length), 7000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, reduced, i]);

  return (
    <div
      className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div role="tablist" aria-label="How Atlas works" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {STEPS.map((s, n) => (
          <button
            key={s.id}
            role="tab"
            id={`flow-tab-${s.id}`}
            aria-selected={i === n}
            aria-controls={`flow-panel-${s.id}`}
            onClick={() => setI(n)}
            className={cn(
              'press relative min-w-[220px] overflow-hidden rounded-card border p-4 text-left lg:min-w-0',
              i === n ? 'border-accent bg-surface' : 'border-line bg-transparent hover:bg-surface'
            )}
          >
            <span className="flex items-center gap-2">
              <span className={cn('grid size-6 place-items-center rounded-full font-mono text-xs font-semibold', i === n ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted')}>{n + 1}</span>
              <span className="text-[15px] font-semibold">{s.title}</span>
            </span>
            <span className="mt-1.5 block text-[13px] leading-relaxed text-muted text-pretty">{s.blurb}</span>
            {i === n && !paused && !reduced && <span key={i} className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[flowbar_7s_linear_forwards] bg-accent" aria-hidden />}
          </button>
        ))}
      </div>

      <div className="min-h-[430px] rounded-[20px] border border-line bg-surface p-4 sm:p-6" role="tabpanel" id={`flow-panel-${STEPS[i].id}`} aria-labelledby={`flow-tab-${STEPS[i].id}`}>
        <div key={STEPS[i].id} className="rise-in h-full">
          {i === 0 && <StepAdd />}
          {i === 1 && <StepUnderstand image={images.roof} />}
          {i === 2 && <StepOrganise sites={counts.sites} />}
          {i === 3 && <StepAsk images={images} />}
          {i === 4 && <StepReport story={images.story} />}
        </div>
      </div>
      <style>{`@keyframes flowbar { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
    </div>
  );
}

function StepAdd() {
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div className="rounded-card border border-dashed border-accent/50 bg-accent-soft/60 p-6 text-center">
        <p className="text-[15px] font-semibold">Drop photos or video here</p>
        <p className="mt-1 text-xs text-muted">JPG, PNG, WEBP up to 10 MB · MP4 up to 100 MB</p>
      </div>
      <PipelineSteps
        steps={[
          { id: 'upload', label: 'Upload', status: 'done', detail: '1920×1440 · 1.2 MB stored, original untouched', ms: 1.4 * 1000 },
          { id: 'record', label: 'Record', status: 'done', detail: 'Public ID, version and ETag saved', ms: 0.4 * 1000 },
          { id: 'understand', label: 'Understand', status: 'active', detail: 'Reading the image with AI…' },
          { id: 'organise', label: 'Organise', status: 'idle' },
          { id: 'index', label: 'Index', status: 'idle' },
        ]}
      />
      <p className="text-[13px] text-muted">The browser uploads with a one-time signed permission, so your secret key is never exposed.</p>
    </div>
  );
}

function StepUnderstand({ image }: { image: string }) {
  return (
    <div className="grid h-full gap-5 md:grid-cols-[1.1fr_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="A group of people on a flooded rooftop in Chennai, 2015" className="aspect-[4/3] w-full rounded-card border border-line object-cover md:aspect-auto md:h-full" loading="lazy" />
      <div className="flex flex-col justify-center gap-3">
        <p className="text-xs font-medium text-muted">What the AI sees</p>
        <p className="text-[15px] leading-relaxed text-pretty">A group of people stands on a flooded building&apos;s roof amid extensive floodwaters that cover the roads and surrounding buildings.</p>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={3} />
          <Badge className="bg-high-soft text-high">Structures submerged</Badge>
          <Badge className="bg-high-soft text-high">People at risk</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['flooding', 'rooftop', 'people', 'aerial view', 'houses'].map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted">Cloudinary AI Vision, with an NVIDIA fallback. Low-confidence results are flagged for a person to confirm.</p>
      </div>
    </div>
  );
}

function StepOrganise({ sites }: { sites: [string, number][] }) {
  return (
    <div>
      <p className="text-[15px] font-semibold">Your whole archive, as it organised itself</p>
      <p className="mb-4 text-[13px] text-muted">Width is how much evidence a site has. Height is each phase. Colour is average flood severity. Illustrative colours; counts are from the Chennai sample set.</p>
      <EvidenceMap sites={buildMap(sites)} onPick={() => undefined} />
    </div>
  );
}

function StepAsk({ images }: { images: FlowImages }) {
  const src = [
    { n: 1, img: images.boats, t: 'Boats in Viduthalai Nagar', k: 1, m: 1, v: 1 },
    { n: 2, img: images.street, t: 'Viduthalai Nagar 2nd main road', k: 3, m: 2, v: 4 },
    { n: 3, img: images.vehicles, t: 'Vehicles submerged', k: 2, m: 4, v: 2 },
  ];
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex justify-end">
        <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2 text-[14px] text-accent-ink">Where did water reach vehicles and rescue boats?</p>
      </div>
      <div className="rounded-card border border-line bg-surface-2/40 p-4">
        <p className="text-[14px] leading-relaxed">
          In <b>Velachery</b>, around Viduthalai Nagar, rescue teams used boats on flooded streets{' '}
          <Chip n={1} /> and vehicles were left partly submerged <Chip n={3} />. The main road was waterlogged{' '}
          <Chip n={2} />.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-low-soft px-2 py-1 text-xs font-medium">
          <CheckCircle size={14} weight="fill" className="text-low" /> Checked against your evidence · 3 of 3 claims supported
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {src.map((s) => (
          <li key={s.n} className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="relative aspect-[16/10]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.img} alt={s.t} className="size-full object-cover" loading="lazy" />
              <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 font-mono text-xs font-semibold text-white">{s.n}</span>
            </div>
            <div className="p-2.5">
              <p className="truncate text-[12px] font-medium">{s.t}</p>
              <p className="mt-1 flex flex-wrap gap-1 text-[10px] font-medium text-muted">
                <span className="rounded bg-surface-2 px-1.5 py-0.5">keywords #{s.k}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5">meaning #{s.m}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5">looks like #{s.v}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ n }: { n: number }) {
  return <span className="mx-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded bg-accent-soft px-1 align-text-top font-mono text-[11px] font-semibold text-accent">{n}</span>;
}

function StepReport({ story }: { story: string }) {
  return (
    <div className="grid h-full gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-semibold tracking-tight text-severe">Severe</p>
            <p className="font-mono text-sm text-muted">
              <span className="text-xl font-semibold text-ink">81</span> / 100
            </p>
          </div>
          <RiskMeter score={81} level="SEVERE" className="mt-3" />
          <p className="mt-3 text-xs text-muted">Six named drivers: forecast rain, chance of rain, wet ground, river level, documented exposure, blocked drains.</p>
        </div>
        <ul className="space-y-2 text-[13px]">
          {['Pre-position dewatering pumps around Velachery.', 'Send a heavy-rain advisory to low-lying streets.', 'Clear the drains flagged in the evidence before rain arrives.'].map((a) => (
            <li key={a} className="flex items-start gap-2">
              <span className="mt-1 size-3.5 shrink-0 rounded border border-line" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Printable, downloadable as Markdown, and shared with a private link or email. Every photo is traceable to its original.</p>
      </div>
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story} alt="Share card rendered by Cloudinary: Severe flood risk ahead, Velachery" className="w-full rounded-card border border-line" loading="lazy" />
        <figcaption className="mt-1.5 text-center text-[11px] text-muted">Share card, built by Cloudinary from one URL</figcaption>
      </figure>
    </div>
  );
}
