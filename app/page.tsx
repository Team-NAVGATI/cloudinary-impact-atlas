import Link from 'next/link';
import { Sparkle } from '@phosphor-icons/react/dist/ssr';
import { HeroCta } from '@/components/hero-cta';
import dynamic from 'next/dynamic';
import { HeroMoment } from '@/components/landing/hero-moment';
import { Bento, Faq, LogicSection, PlaybookStrip, ProblemContrast } from '@/components/landing/sections';
import { Logo } from '@/components/nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { LinkButton } from '@/components/ui';
import { counts, IMG, storyDemo, url } from '@/lib/landing-data';

export const revalidate = 900;

// Below the fold and interactive: split into its own chunk so the hero paints without waiting for it.
// (Still server-rendered, so the content is in the HTML for crawlers and slow connections.)
const FlowTabs = dynamic(() => import('@/components/landing/flow-tabs').then((m) => m.FlowTabs), {
  loading: () => <div className="min-h-[430px] rounded-[20px] border border-line bg-surface" aria-hidden />,
});

const NAV = [
  ['How it works', '#flow'],
  ['Features', '#features'],
  ['Playbooks', '#playbooks'],
  ['Logic', '#logic'],
  ['FAQ', '#faq'],
];

function Section({ id, title, lead, children, className = '' }: { id: string; title: string; lead?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-4 py-16 md:py-24 ${className}`} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="display max-w-3xl text-3xl font-semibold md:text-5xl">
        {title}
      </h2>
      {lead && <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted text-pretty">{lead}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo /> Impact Atlas
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="press rounded-field px-3 py-2 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
                {label}
              </a>
            ))}
            <Link href="/guide" className="press rounded-field px-3 py-2 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
              Guide
            </Link>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <LinkButton href="/login" className="hidden sm:inline-flex">
              Sign in
            </LinkButton>
            <LinkButton href="/login" variant="primary">
              Try the demo
            </LinkButton>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <div className="glow-bg">
          <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:pb-28 lg:pt-20" aria-labelledby="hero-h">
            <div>
              <h1 id="hero-h" className="display text-5xl font-semibold md:text-6xl lg:text-[4.2rem]">
                Field photos in. Proof out.
              </h1>
              <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-muted text-pretty">
                Atlas organises your photos and video, reads them with AI, and turns them into searchable proof, reports and alerts.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <HeroCta />
                <LinkButton href="/guide" className="h-11 px-5 text-[14px]">
                  Take the 60-second tour
                </LinkButton>
              </div>
              <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkle size={13} weight="fill" className="text-accent" /> Built on
                </span>
                <span className="font-medium text-ink">Cloudinary</span>
                <span className="font-medium text-ink">NVIDIA Nemotron</span>
                <span className="font-medium text-ink">Supabase</span>
                <span className="font-medium text-ink">Open-Meteo</span>
              </p>
            </div>
            <HeroMoment />
          </section>
        </div>

        {/* Problem -> answer */}
        <Section id="problem" title="Thousands of photos. No way to find, prove or send them." lead="Field teams capture the truth, then it disappears into phones and shared drives. Atlas turns the same files into something you can search, question and hand to someone who must act.">
          <ProblemContrast />
        </Section>

        {/* Flow */}
        <div className="border-y border-line bg-surface/60">
          <Section id="flow" title="From a photo to a decision in five steps" lead="Nothing to configure. Add a file and watch each step happen.">
            <FlowTabs
              images={{ roof: url.card(IMG.roof), boats: url.card(IMG.boats), street: url.card(IMG.street), vehicles: url.card(IMG.vehicles), story: storyDemo }}
              counts={{ sites: counts.sites.slice(0, 6) }}
            />
          </Section>
        </div>

        {/* Features */}
        <Section id="features" title="Everything an evidence team keeps rebuilding in spreadsheets" lead="Organise, search, question, compare, prove, and deliver, in one place.">
          <Bento />
        </Section>

        {/* Playbooks */}
        <div className="border-y border-line bg-surface/60">
          <Section id="playbooks" title="One tool. Many jobs. Chennai first." lead="Atlas is general on purpose. A playbook adds the specifics of a job, and Chennai Flood-Watch shows how it fits together end to end.">
            <PlaybookStrip />
          </Section>
        </div>

        {/* Logic */}
        <Section id="logic" title="Answers you can check, not just read" lead="Search runs three ways and merges the results. Then the answer is fact-checked against the photos it cites, and you can see every step.">
          <LogicSection />
        </Section>

        {/* Try it */}
        <div className="border-y border-line bg-surface/60">
          <Section id="try" title="Try it in under a minute">
            <ol className="grid gap-4 md:grid-cols-3">
              {[
                ['Open the demo', 'One click on the sign-in page. No account needed.'],
                ['Pick a sample photo', 'The Studio has three real Chennai photos. Watch every step run.'],
                ['Ask a question', 'Try "Which photos show boats or rescue?" and read how the answer was made.'],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-[20px] border border-line bg-surface p-5">
                  <span className="grid size-8 place-items-center rounded-full bg-accent font-mono text-sm font-semibold text-accent-ink">{i + 1}</span>
                  <h3 className="mt-3 text-[16px] font-semibold">{t}</h3>
                  <p className="mt-1 text-[13px] text-muted text-pretty">{d}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* FAQ */}
        <Section id="faq" title="Questions people ask first">
          <Faq />
        </Section>

        {/* Final CTA */}
        <section className="px-4 pb-20" aria-labelledby="cta-h">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0d3b2e] px-6 py-14 text-center text-[#eaf3ee] md:py-20">
            <h2 id="cta-h" className="display mx-auto max-w-2xl text-3xl font-semibold md:text-5xl">
              See your evidence organise itself
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[16px] text-[#b9d3c7] text-pretty">Open the demo, drop a sample photo, and ask it a question.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/login" className="press inline-flex h-12 items-center rounded-field bg-highlight px-6 text-[15px] font-semibold text-highlight-ink hover:brightness-105">
                Try the live demo
              </Link>
              <Link href="/architecture" className="press inline-flex h-12 items-center rounded-field border border-white/25 px-6 text-[15px] font-medium hover:bg-white/10">
                See how it works inside
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted">
          <span className="flex items-center gap-2">
            <Logo className="size-5" /> Impact Atlas · Built for CodeFibonacci × Cloudinary
          </span>
          <nav className="flex gap-4" aria-label="Footer">
            <Link href="/guide" className="underline">
              Guide
            </Link>
            <Link href="/architecture" className="underline">
              Architecture
            </Link>
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
