import Link from 'next/link';
import { Logo } from '@/components/nav';
import { LinkButton } from '@/components/ui';

export const metadata = {
  title: 'Guide | Impact Atlas',
  description: 'A step-by-step tutorial: add evidence, watch it organise, ask questions, compare, report and send.',
};

interface Step {
  id: string;
  title: string;
  where: string;
  href: string;
  what: string;
  do: string[];
  see: string[];
  why: string;
}

const STEPS: Step[] = [
  {
    id: 'add',
    title: 'Add evidence in the Studio',
    where: 'Studio',
    href: '/studio',
    what: 'The Studio is your home screen. Everything happens on one page: files go in on the left, and a live pipeline runs on the right.',
    do: ['Open the demo from the sign-in page.', 'Click one of the three sample photos, or drop your own JPG, PNG, WEBP or MP4.', 'Optionally choose the site and whether the photo shows a normal day, an event or recovery.'],
    see: ['Five steps light up in order: Upload, Record, Understand, Organise, Index.', 'Your original sits next to the version Cloudinary delivers, with the bytes saved.', 'A caption, severity, risk flags, site match and tags appear as each step finishes.'],
    why: 'You never have to sort or label a photo by hand. The originals stay untouched in Cloudinary.',
  },
  {
    id: 'library',
    title: 'See how it is organised',
    where: 'Library',
    href: '/library',
    what: 'The Library groups everything into smart collections computed from the photos themselves.',
    do: ['Open the Library and look at the left panel: sites, phases, severity, events and AI tags, each with a count.', 'Click "Evidence map" to see the whole archive as one picture.', 'Type a description such as "flooded road" or "boat rescue".'],
    see: ['A treemap where width is the amount of evidence per site and colour is average severity.', 'Filter chips you can remove one by one.', 'A "Needs review" badge on results the AI was unsure about.'],
    why: 'This is how you trust a large archive: you can see its structure, not just its files.',
  },
  {
    id: 'ask',
    title: 'Ask in plain language',
    where: 'Ask',
    href: '/ask',
    what: 'Ask a question the way you would ask a colleague. Atlas searches every photo, caption, report and live forecast.',
    do: ['Open Ask and pick a suggested question, or type your own.', 'Click a small number in the answer to jump to that source photo.', 'Open "How this answer was made" to read the reasoning.'],
    see: ['Three progress steps: Plan, Retrieve, Read and answer.', 'Each source shows how it matched: keywords, meaning, or "looks like".', 'A green line saying the answer was checked, with a tick or warning for every claim.'],
    why: 'Answers you cannot check are guesses. Here every claim points to a photo and is tested against it.',
  },
  {
    id: 'compare',
    title: 'Compare before and after',
    where: 'Compare',
    href: '/compare',
    what: 'Slide between two photos cropped the same way to see what changed.',
    do: ['Open Compare, or select two photos in the Library and press Compare.', 'Drag the handle, or use the left and right arrow keys.', 'Press "Save and explain the change".'],
    see: ['A plain-language summary of what changed.', 'A notice if the two photos are from different sites, because that is a reference, not a change over time.'],
    why: 'Before-and-after is the clearest proof that something changed, and Atlas is careful not to overstate it.',
  },
  {
    id: 'report',
    title: 'Make a report',
    where: 'Reports',
    href: '/reports',
    what: 'A report turns any set of photos into a designed, printable document with sources and traceability.',
    do: ['In the Library, tick several photos, then choose "Make a report".', 'Or open Reports and describe what to include, for example "severe, during Cyclone Michaung".', 'Choose "Flood-risk report" to add live rainfall, river flow and a risk score for a Chennai site.'],
    see: ['A summary and key findings, then figures with credit and licence.', 'A before/after slider when the selection contains a true pair.', 'A traceability table listing the exact Cloudinary transformation of every image.'],
    why: 'The AI writes only the summary. Everything else is built from data, so the report stays factual.',
  },
  {
    id: 'send',
    title: 'Send it to the person who can act',
    where: 'Reports',
    href: '/reports',
    what: 'Share a private link, email it to authorised contacts, or create a share card.',
    do: ['Open a report and press "Send to officer", then pick the recipients.', 'Press "Story card" for a 1080×1350 image built by Cloudinary.', 'Use "Save as PDF" or "Markdown" to keep a copy.'],
    see: ['A dispatch log showing who was sent what and when.', 'If email is not configured, a prepared link you can send yourself.'],
    why: 'The last step matters most: the right person sees the proof in time to act.',
  },
  {
    id: 'playbooks',
    title: 'Connect it to a real case',
    where: 'Workflow and Playbooks',
    href: '/workflow?playbook=chennai',
    what: 'Atlas is a general tool. A playbook adds the specifics of a job. Chennai Flood-Watch is the first.',
    do: ['Open Workflow and click any step to learn what it does and where it lives.', 'Switch on "+ Chennai Flood-Watch" to see the extra steps light up.', 'Open Playbooks to see what the other templates would define.'],
    see: ['A map of the real pipeline with live counts.', 'Amber steps for live feeds, the risk engine and named officers, attached to the generic steps they extend.'],
    why: 'It shows the same engine serving a specific, real problem.',
  },
];

const GLOSSARY: [string, string][] = [
  ['Evidence', 'A photo or video plus everything Atlas knows about it: caption, tags, site, source, licence, version.'],
  ['Site', 'A named place, such as Velachery. Photos are filed to a site by GPS or place names.'],
  ['Phase', 'Before (normal), during (event) or after (recovery).'],
  ['Severity', 'A 0 to 3 rating: none, minor water, waterlogged, severe flooding.'],
  ['Playbook', 'The extras that make Atlas useful for one job: sites, what to look for, live data, scoring, recipients.'],
  ['Provisional', 'A rating made from a photo’s written description because image AI was unavailable. Confirm it before relying on it.'],
];

export default function GuidePage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo /> Impact Atlas
          </Link>
          <div className="flex gap-1">
            <LinkButton href="/architecture" variant="ghost">
              Architecture
            </LinkButton>
            <LinkButton href="/login" variant="primary">
              Try the demo
            </LinkButton>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="On this page">
          <p className="text-xs font-medium text-muted">In this guide</p>
          <ol className="mt-2 space-y-0.5">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="press flex gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-ink">
                  <span className="font-mono text-xs text-accent">{i + 1}</span> {s.title.replace(/ in the Studio| in plain language| before and after/, '')}
                </a>
              </li>
            ))}
            <li>
              <a href="#words" className="press flex gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-ink">
                <span className="font-mono text-xs text-accent">+</span> Plain-language glossary
              </a>
            </li>
          </ol>
        </aside>

        <div className="space-y-14">
          <div>
            <h1 className="display text-4xl font-semibold md:text-5xl">Learn Atlas in ten minutes</h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted text-pretty">
              Seven short steps take you from your first photo to a report in someone&apos;s inbox. Each step says what to do, what you will see, and why it matters. Inside the app, press{' '}
              <b className="text-ink">Take the tour</b> in the Studio for a guided walk-through, or open the <b className="text-ink">Get started</b> checklist, which ticks itself off.
            </p>
          </div>

          {STEPS.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="border-t border-line pt-8">
              <p className="font-mono text-xs text-accent">Step {i + 1} · {s.where}</p>
              <h2 id={`${s.id}-h`} className="mt-1 text-2xl font-semibold tracking-tight text-balance">
                {s.title}
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted text-pretty">{s.what}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-card border border-line bg-surface p-4">
                  <h3 className="text-[13px] font-semibold">Do this</h3>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted">
                    {s.do.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-card border border-line bg-surface p-4">
                  <h3 className="text-[13px] font-semibold">You will see</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted">
                    {s.see.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 rounded-field bg-accent-soft px-3.5 py-2.5 text-[13px] leading-relaxed">
                <b>Why it matters.</b> {s.why}
              </p>
              <div className="mt-4">
                <LinkButton href={s.href}>Open {s.where.split(' and ')[0]}</LinkButton>
              </div>
            </section>
          ))}

          <section id="words" aria-labelledby="words-h" className="border-t border-line pt-8">
            <h2 id="words-h" className="text-2xl font-semibold tracking-tight">
              Plain-language glossary
            </h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {GLOSSARY.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3 sm:grid-cols-[140px_1fr]">
                  <dt className="text-[14px] font-semibold">{k}</dt>
                  <dd className="text-[14px] text-muted text-pretty">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}
