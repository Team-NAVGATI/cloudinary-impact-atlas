import Link from 'next/link';
import { ArrowRight, CheckCircle, Drop, Files, Fingerprint, GitDiff, MagnifyingGlass, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { CompareSlider } from '@/components/compare-slider';
import { RiskMeter } from '@/components/risk-blocks';
import { LinkButton, RiskBadge } from '@/components/ui';
import { computeRisk } from '@/lib/risk';
import { counts, IMG, sampleMeta, url } from '@/lib/landing-data';
import { fetchWeather, imdClass } from '@/lib/weather/openmeteo';

/* ------------------------------------------------------------------ problem -> answer */
const MESSY = ['IMG_2041.jpg', 'WhatsApp Image 2023-12-04 at 17.32.11 (3).jpeg', 'flood_final_FINAL2.jpg', 'DSC00981.JPG', 'Screenshot 2023-12-05.png', 'new folder (7)/IMG_2044.jpg', 'boat??.jpg'];

export function ProblemContrast() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[20px] border border-line bg-surface p-5">
        <p className="text-xs font-medium text-muted">Today</p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight">A shared drive nobody can search</h3>
        <ul className="mt-4 space-y-1.5 font-mono text-[12.5px] text-muted">
          {MESSY.map((f, i) => (
            <li key={f} className="flex items-center gap-2 rounded-md bg-surface-2/70 px-2.5 py-1.5" style={{ opacity: 1 - i * 0.08 }}>
              <span className="size-3.5 shrink-0 rounded-sm border border-line" aria-hidden />
              <span className="truncate">{f}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-muted text-pretty">Which of these show the worst flooding? Who took them, where, and can we prove it? Nobody knows without opening every file.</p>
      </div>
      <div className="rounded-[20px] border border-accent/40 bg-accent-soft/50 p-5">
        <p className="text-xs font-medium text-accent">With Atlas</p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight">The same files, understood and filed</h3>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[IMG.boats, IMG.roof, IMG.vehicles, IMG.street, IMG.aerialFlood, IMG.inundation].map((m, i) => (
            <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-md border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url.thumb(m)} alt="" className="size-full object-cover" loading="lazy" />
              <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[9.5px] font-medium text-white">{['Velachery', 'City-wide', 'Velachery', 'Velachery', 'City-wide', 'City-wide'][i]}</span>
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {['During · Severe', 'Cyclone Michaung 2023', 'Rescue boat', 'Credit + licence kept'].map((t) => (
            <li key={t} className="rounded-md bg-surface px-2 py-1 font-medium">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-muted text-pretty">Search by what is in the picture, ask a question, and every answer points back to the photo, its credit and its original.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ feature bento */
export function Bento() {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      {/* A: smart collections */}
      <div className="rounded-[20px] border border-line bg-surface p-5 lg:col-span-4">
        <h3 className="text-lg font-semibold tracking-tight">It organises itself</h3>
        <p className="mt-1 max-w-md text-[13px] text-muted text-pretty">Sites, phases, events, severity and tags are computed from the photos. You get collections you never had to build.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          {[
            ['Sites', counts.sites.slice(0, 5)],
            ['Phase', counts.phases],
            ['Events', counts.events.slice(0, 3)],
          ].map(([title, rows]) => (
            <div key={title as string}>
              <p className="text-[11px] font-medium text-muted">{title as string}</p>
              <ul className="mt-1.5 space-y-1">
                {(rows as [string, number][]).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-2 rounded-md bg-surface-2/70 px-2 py-1 text-[12.5px]">
                    <span className="truncate">{k}</span>
                    <span className="font-mono text-xs text-muted">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-medium text-muted">AI tags</p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {['flooding', 'rescue boat', 'river', 'aerial view', 'street', 'motorcycles', 'rooftop'].map((t) => (
                <li key={t} className="rounded-md bg-surface-2/70 px-2 py-1 text-[12px]">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">Counts are the real Chennai sample set ({counts.total} photos).</p>
      </div>

      {/* B: search by look */}
      <div className="rounded-[20px] border border-line bg-surface p-5 lg:col-span-2">
        <h3 className="text-lg font-semibold tracking-tight">Search by what it looks like</h3>
        <p className="mt-1 text-[13px] text-muted text-pretty">Pictures and words live in one space, so a description finds the photo itself.</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[13px]">
          <MagnifyingGlass size={14} /> rescue boat in a flooded street
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[[IMG.boats, '0.42'], [IMG.aerialCalm, '0.18']].map(([m, s], i) => (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url.thumb(m as typeof IMG.boats)} alt="" className="aspect-square w-full rounded-md border border-line object-cover" loading="lazy" />
              <figcaption className="mt-1 text-center font-mono text-[11px] text-muted">{s as string}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Measured similarity to the query. The calm aerial view scores far lower.</p>
      </div>

      {/* C: before/after */}
      <div className="rounded-[20px] border border-line bg-surface p-5 lg:col-span-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <GitDiff size={18} className="text-accent" /> Before and after
        </h3>
        <p className="mb-3 mt-1 text-[13px] text-muted text-pretty">Drag to compare two photos cropped identically. Pairs from different places are labelled as a reference, never as a change over time.</p>
        <CompareSlider beforeUrl={url.compare(IMG.aerialCalm)} afterUrl={url.compare(IMG.aerialFlood)} beforeLabel="A normal day, from above" afterLabel="During the floods" />
      </div>

      {/* D: traceable */}
      <div className="rounded-[20px] border border-line bg-surface p-5 lg:col-span-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Fingerprint size={18} className="text-accent" /> Traceable to the original
        </h3>
        <p className="mt-1 text-[13px] text-muted text-pretty">Originals are never edited. Every image in a report is a named transformation of one, recorded so anyone can re-create it.</p>
        <pre className="mt-4 overflow-x-auto rounded-card border border-line bg-surface-2/70 p-3 font-mono text-[11.5px] leading-relaxed">
{`public_id  ${sampleMeta.publicId}
version    ${sampleMeta.version}
source     Wikimedia Commons · CC BY-SA 4.0
credit     Palanis1

report  →  c_limit,w_1200,q_auto,f_auto
thumb   →  c_fill,g_auto,w_480,h_320,q_auto,f_auto`}
        </pre>
      </div>

      {/* E: ask + check */}
      <div className="rounded-[20px] border border-line bg-surface p-5 lg:col-span-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Sparkle size={18} weight="fill" className="text-accent" /> Answers that check themselves
        </h3>
        <p className="mt-1 text-[13px] text-muted text-pretty">Every number and citation is traced to your evidence, and each claim is tested against the photo it cites. (Illustrative example below.)</p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {[
            ['Rescue teams used boats on flooded streets [1]', true],
            ['Water reached the roofs of low houses [2]', true],
            ['About 400 homes were affected', false],
          ].map(([c, ok]) => (
            <li key={c as string} className="flex items-start gap-2 rounded-md bg-surface-2/60 px-3 py-2">
              {ok ? <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-low" /> : <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-severe text-[10px] font-bold text-white">!</span>}
              <span className={ok ? '' : 'text-severe'}>
                {c as string}
                {!ok && <span className="ml-1 text-xs text-muted">Not in your evidence, so it is flagged.</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* F: deliver */}
      <div className="rounded-[20px] border border-line bg-surface p-5 lg:col-span-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <PaperPlaneTilt size={18} className="text-accent" /> Sent to the person who can act
        </h3>
        <p className="mt-1 text-[13px] text-muted text-pretty">A private link, an email or a share card. Every send is logged with who, when and whether it arrived.</p>
        <div className="mt-4 rounded-card border border-line bg-surface-2/50 p-3 text-[13px]">
          <p className="inline-block rounded bg-severe px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">SEVERE FLOOD RISK</p>
          <p className="mt-2 font-medium">Velachery: severe flood risk, 29 Sept 2026</p>
          <p className="mt-0.5 text-xs text-muted">To: Ward Engineer, Storm Water Drains · Score 81/100 · 350 mm forecast</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink">
            <Files size={13} /> Open the full report
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ playbooks */
export async function PlaybookStrip() {
  let live: { w: Awaited<ReturnType<typeof fetchWeather>>; risk: ReturnType<typeof computeRisk> } | null = null;
  try {
    const w = await fetchWeather(12.9815, 80.218);
    live = { w, risk: computeRisk(w, { maxSeverity: 0, drainIssues: 0, count: 0 }) };
  } catch {
    live = null;
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <ol className="space-y-3">
          {[
            ['Atlas is general', 'Store, read, organise, search, ask, compare, report, deliver. It knows nothing about floods.'],
            ['A playbook makes it specific', 'Five things: the sites it watches, what the AI looks for, live data it joins, how it scores, and who it tells.'],
            ['Chennai Flood-Watch is the first', 'Seven flood-prone zones, flood signals, live rainfall and river flow, a transparent risk score, and named officers.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent font-mono text-xs font-semibold text-accent-ink">{i + 1}</span>
              <div>
                <p className="text-[15px] font-semibold">{t}</p>
                <p className="text-[13px] text-muted text-pretty">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          {['Reforestation', 'Waste and clean-ups', 'Infrastructure inspection', 'Wildlife camera traps'].map((p) => (
            <span key={p} className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted">
              {p} · template
            </span>
          ))}
        </div>
        <div className="mt-5">
          <LinkButton href="/login" variant="secondary">
            See the workflow map <ArrowRight size={14} />
          </LinkButton>
        </div>
      </div>

      <aside className="rounded-[20px] border border-line bg-surface p-5" aria-label="Live forecast for Velachery, Chennai">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Drop size={16} weight="fill" className="text-accent" /> Velachery, live
          </p>
          {live && <RiskBadge level={live.risk.level} score={live.risk.score} />}
        </div>
        {live ? (
          <>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-mono text-6xl font-semibold leading-none tracking-tight tabular-nums">{live.w.next24hMm}</span>
              <span className="pb-1.5 text-sm text-muted">mm next 24 h · {imdClass(live.w.next24hMm).label.toLowerCase()}</span>
            </div>
            <RiskMeter score={live.risk.score} level={live.risk.level} className="mt-6" />
            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4 text-[13px]">
              <div>
                <dt className="text-xs text-muted">Last 48 h</dt>
                <dd className="font-mono font-medium tabular-nums">{live.w.past48hMm} mm</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Chance of rain</dt>
                <dd className="font-mono font-medium tabular-nums">{live.w.peakProb}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">River flow</dt>
                <dd className="font-mono font-medium tabular-nums">{live.w.river?.ratio != null ? `${live.w.river.ratio}× mean` : 'n/a'}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">Real data from Open-Meteo, refreshed every 15 minutes. Forecast-only score; reports add photo evidence.</p>
          </>
        ) : (
          <p className="mt-6 text-[13px] text-muted">The forecast service is not reachable right now.</p>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ logic */
export function LogicSection() {
  const lane = (y: number, label: string, sub: string) => (
    <g>
      <rect x="10" y={y} width="180" height="52" rx="10" fill="var(--surface)" stroke="var(--line)" />
      <text x="24" y={y + 22} fontSize="13" fontWeight="600" fill="var(--ink)">{label}</text>
      <text x="24" y={y + 40} fontSize="11" fill="var(--muted)">{sub}</text>
      <path d={`M190 ${y + 26} C 250 ${y + 26} 250 148 310 148`} fill="none" stroke="var(--muted)" strokeWidth="1.4" markerEnd="url(#lg-a)" />
    </g>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="dot-grid overflow-x-auto rounded-[20px] border border-line bg-surface p-3">
        <svg viewBox="0 0 900 300" className="min-w-[640px] w-full" role="img" aria-label="Three searches feed one ranking, then an answer, then a fact-check">
          <defs>
            <marker id="lg-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="var(--muted)" />
            </marker>
          </defs>
          {lane(50, 'Keywords', 'BM25 on captions + tags')}
          {lane(124, 'Meaning', 'text vector of context')}
          {lane(198, 'Looks like', 'image vector of pixels')}
          <rect x="310" y="118" width="170" height="60" rx="12" fill="var(--accent-soft)" stroke="var(--accent)" />
          <text x="326" y="144" fontSize="13" fontWeight="600" fill="var(--ink)">Fuse the ranks</text>
          <text x="326" y="162" fontSize="11" fill="var(--muted)">Reciprocal Rank Fusion, k=60</text>
          <path d="M480 148 H 540" stroke="var(--muted)" strokeWidth="1.4" markerEnd="url(#lg-a)" />
          <rect x="540" y="118" width="150" height="60" rx="12" fill="var(--surface)" stroke="var(--line)" />
          <text x="556" y="144" fontSize="13" fontWeight="600" fill="var(--ink)">Answer</text>
          <text x="556" y="162" fontSize="11" fill="var(--muted)">top 12 only, cited [n]</text>
          <path d="M690 148 H 740" stroke="var(--muted)" strokeWidth="1.4" markerEnd="url(#lg-a)" />
          <rect x="740" y="108" width="150" height="80" rx="12" fill="var(--low-soft)" stroke="var(--low)" />
          <text x="756" y="134" fontSize="13" fontWeight="600" fill="var(--ink)">Fact-check</text>
          <text x="756" y="152" fontSize="11" fill="var(--muted)">numbers traced,</text>
          <text x="756" y="167" fontSize="11" fill="var(--muted)">claims judged</text>
        </svg>
      </div>
      <div className="space-y-4">
        <div>
          <h3 className="text-[15px] font-semibold">Why three searches?</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted text-pretty">Keywords find exact words, meaning finds paraphrases, and the image vector finds photos whose captions missed something. Where they agree, confidence is high.</p>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold">Why check the answer?</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted text-pretty">Language models over-claim. Atlas verifies every figure and citation against what was retrieved, then tests each claim against the cited photo, and shows the result.</p>
        </div>
        <Link href="/architecture" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent underline">
          Read the research and see the diagrams <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ faq */
const FAQ = [
  ['Is this only for floods?', 'No. Atlas is a general evidence tool. Floods are the first playbook because the data was available and the stakes are real. A playbook defines the sites, what the AI looks for, live data, scoring and recipients.'],
  ['Where do my photos live?', 'In your own Cloudinary account. The original is stored unchanged; every thumbnail, crop or report image is a URL that transforms it, and the exact transformation is recorded.'],
  ['Can I trust the AI?', 'It shows its work. Answers cite numbered photos, every figure is traced to the retrieved evidence, each claim is tested against its source, and low-confidence results are flagged for a person to confirm.'],
  ['What if an AI service is down?', 'Atlas falls back: Cloudinary AI Vision, then an NVIDIA vision model, then rules that read the source description. Anything from the last tier is labelled provisional.'],
  ['What does it cost to run?', 'The demo runs on free tiers: Cloudinary, Supabase, NVIDIA developer keys and Open-Meteo. Nothing here needs a paid plan to try.'],
  ['Is the demo data real?', 'The photos are real, openly licensed Chennai images with credit and licence kept. Rain and river numbers are live. "Rehearse a storm" uses invented rainfall and says so on every report.'],
];

export function Faq() {
  return (
    <div className="divide-y divide-line rounded-[20px] border border-line bg-surface">
      {FAQ.map(([q, a]) => (
        <details key={q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
            {q}
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted text-pretty">{a}</p>
        </details>
      ))}
    </div>
  );
}
