import Link from 'next/link';
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr';
import { Logo } from '@/components/nav';
import { LinkButton } from '@/components/ui';

export const metadata = {
  title: 'How it works | Impact Atlas',
  description: 'Architecture of Impact Atlas: how a field photo becomes searchable, checked, traceable evidence. Diagrams generated with Archify.',
};

const LIFE = [
  ['Upload', 'The browser asks our server for a one-time signature, then sends the file straight to Cloudinary. The original is stored untouched and the API secret never leaves the server.'],
  ['Record', 'The server checks the folder belongs to your organisation, then saves the Cloudinary public ID, asset ID, version and ETag in Supabase.'],
  ['Understand', 'Cloudinary AI Vision answers four questions: caption, flood severity 0 to 3, which risk signals are clearly visible, and tags. If that add-on is off, an NVIDIA Nemotron vision model runs; if neither is, rules read the photo’s source description and mark the result provisional.'],
  ['Organise', 'The photo is matched to a site by GPS distance or place names, grouped by phase and event, and tagged. Results the AI is unsure about are flagged "Needs review" for a person to confirm.'],
  ['Index', 'Two vectors are stored per photo in one shared space: one from the pixels, one from a description that carries its own context (site, phase, event, date). This is what makes search by meaning and by look possible.'],
  ['Ask, compare, report', 'Questions are answered from retrieved evidence with numbered sources, then fact-checked. Comparisons use identical Cloudinary crops. Reports are generated from a fixed template; the LLM writes only the summary and findings.'],
  ['Deliver', 'A private link, an email, or a 1080×1350 share card that Cloudinary renders from the top photo. Every send is logged.'],
];

const RESEARCH: { idea: string; how: string; see: string; href: string; source: string }[] = [
  {
    idea: 'Hybrid retrieval',
    how: 'BM25 keyword ranking, text-meaning vectors and image-content vectors run side by side and are merged.',
    see: 'Ask: "How this answer was made", and the "keywords #2 · meaning #1 · looks like #3" chips on each source',
    href: 'https://www.anthropic.com/engineering/contextual-retrieval',
    source: 'Anthropic, Contextual Retrieval (2024): hybrid search cut failed retrievals by 49%',
  },
  {
    idea: 'Reciprocal Rank Fusion',
    how: 'Merges the three rankings using ranks only (k=60), so keyword scores and cosine scores never need to be made comparable.',
    see: 'Ask: the fused score on every source card',
    href: 'https://dl.acm.org/doi/10.1145/1571941.1572114',
    source: 'Cormack, Clarke and Büttcher, SIGIR 2009',
  },
  {
    idea: 'Contextual chunks',
    how: 'The text embedded for each photo starts with its site, phase, event and date, so a vector "knows" where it is from.',
    see: 'Studio: the Index step reports text and image vectors',
    href: 'https://www.anthropic.com/engineering/contextual-retrieval',
    source: 'Anthropic, Contextual Retrieval (2024)',
  },
  {
    idea: 'Multimodal embeddings',
    how: 'One NVIDIA Llama Nemotron Embed VL model places pictures and text in the same space, so "rescue boat in a flooded street" finds the photo itself.',
    see: 'Ask, and the "looks like" rank on each source',
    href: 'https://build.nvidia.com/nvidia/llama-nemotron-embed-vl-1b-v2',
    source: 'NVIDIA NeMo Retriever, Llama Nemotron Embed VL',
  },
  {
    idea: 'Faithfulness checking',
    how: 'Every number and citation is traced to the retrieved context, and an LLM judge tests each claim against the photo it cites.',
    see: 'Ask: the green "Checked against your evidence" line and per-claim ticks',
    href: 'https://arxiv.org/abs/2309.15217',
    source: 'Es et al., RAGAS (2023): faithfulness as a reference-free metric',
  },
  {
    idea: 'Grounded planning',
    how: 'The LLM may suggest filters, but a site, phase or severity filter is applied only if your own words support it. Ignored suggestions are listed.',
    see: 'Ask: "Ignored suggestions the question did not support"',
    href: 'https://arxiv.org/abs/2309.15217',
    source: 'Guards against a retrieval failure we hit in testing (invented filters hid the best photo)',
  },
  {
    idea: 'Human in the loop',
    how: 'Low-confidence AI results are flagged, filterable and logged when a person confirms or corrects them.',
    see: 'Library: "Needs review" filter; evidence page: review buttons',
    href: '/library',
    source: 'Standard practice for AI-assisted evidence',
  },
  {
    idea: 'Transparent scoring',
    how: 'The flood risk score is a plain sum of six named parts using India Meteorological Department rainfall classes, not a black box.',
    see: 'Every flood-risk report opens with the six drivers',
    href: 'https://mausam.imd.gov.in/',
    source: 'IMD 24-hour rainfall classes; GloFAS river discharge via Open-Meteo',
  },
];

const CLOUDINARY = [
  ['Signed direct upload', 'Browser to Cloudinary with a server-made signature. Organisation folder enforced.', 'lib/cloudinary/server.ts'],
  ['AI Vision (Analyze API)', 'Four prompts per image: caption, severity, visible signals, tags. Token quota tracked; hands over to NVIDIA before it runs out.', 'lib/ai/vision.ts'],
  ['Delivery transformations', 'Smart crop (c_fill, g_auto), q_auto, f_auto. Thumbnails, cards, comparisons and report figures are all URLs, never copies. The Studio shows the bytes saved.', 'lib/cloudinary/urls.ts'],
  ['Text overlays', 'The 1080×1350 story card: dimmed photo, risk badge, headline and stats, rendered by URL.', 'app/api/reports/[id]/story'],
  ['Tags and context sync', 'AI tags and severity are written back onto the Cloudinary asset so it stays searchable there too.', 'lib/pipeline/analyze.ts'],
  ['Perceptual hash', 'Cloudinary’s phash is stored to spot duplicate uploads.', 'lib/embeddings.ts'],
];

const TABLES = [
  ['media_assets', 'One row per photo or video: Cloudinary IDs, version, ETag, site, phase, severity, source, licence, credit, search vector, embeddings, perceptual hash.'],
  ['ai_analyses', 'Every AI result kept with provider, model, confidence, signals and raw response.'],
  ['zones, contacts', 'Named sites and the people authorised to receive their reports (the Chennai playbook).'],
  ['comparisons', 'Saved before/after pairs with a plain-language summary.'],
  ['reports', 'The Markdown, risk score, weather snapshot, evidence list and a private share token.'],
  ['asset_provenance', 'The exact transformation and derived URL used every time an image appears in a report.'],
  ['alerts, media_reviews', 'Who was sent what, and every human confirmation or correction.'],
];

export default function ArchitecturePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo /> Impact Atlas
          </Link>
          <div className="flex gap-1">
            <LinkButton href="/guide" variant="ghost">
              Guide
            </LinkButton>
            <LinkButton href="/login" variant="primary">
              Try the demo
            </LinkButton>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl space-y-16 px-4 py-12">
        <section>
          <h1 className="display text-4xl font-semibold md:text-5xl">How Impact Atlas works</h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted text-pretty">
            Atlas is a general tool: put field photos in, get organised, searchable, provable evidence out. On top of it, a <b className="text-ink">playbook</b> adds the specifics of a job. The first
            playbook, Chennai Flood-Watch, joins the evidence to live rainfall and river data and tells the officer who must act.
          </p>
        </section>

        <section aria-labelledby="sys">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="sys" className="text-2xl font-semibold tracking-tight">
              The system
            </h2>
            <a href="/diagrams/system.architecture.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent underline">
              Open full screen <ArrowSquareOut size={14} />
            </a>
          </div>
          <p className="mt-2 max-w-2xl text-[14px] text-muted text-pretty">
            Generated with <a className="underline" href="https://github.com/tt-a1i/archify" target="_blank" rel="noopener noreferrer">Archify</a> from a typed description, then validated and rendered. Search nodes, switch theme, and trace paths inside the diagram.
          </p>
          <iframe
            src="/diagrams/system.architecture.html"
            title="Impact Atlas system architecture diagram"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
            className="mt-4 h-[760px] w-full rounded-card border border-line bg-surface"
          />
        </section>

        <section aria-labelledby="ask">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="ask" className="text-2xl font-semibold tracking-tight">
              How a question becomes a checked answer
            </h2>
            <a href="/diagrams/ask-retrieval.sequence.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent underline">
              Open full screen <ArrowSquareOut size={14} />
            </a>
          </div>
          <iframe
            src="/diagrams/ask-retrieval.sequence.html"
            title="Ask retrieval sequence diagram"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
            className="mt-4 h-[860px] w-full rounded-card border border-line bg-surface"
          />
        </section>

        <section aria-labelledby="life">
          <h2 id="life" className="text-2xl font-semibold tracking-tight">
            The life of one photo
          </h2>
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {LIFE.map(([t, d], i) => (
              <li key={t} className="grid gap-1 py-4 sm:grid-cols-[190px_1fr] sm:gap-6">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs tabular-nums text-accent">{i + 1}</span>
                  <h3 className="text-[14px] font-semibold">{t}</h3>
                </div>
                <p className="text-[14px] leading-relaxed text-muted text-pretty">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="research">
          <h2 id="research" className="text-2xl font-semibold tracking-tight">
            The research behind the design
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] text-muted text-pretty">
            Each technique is visible somewhere in the product, so you can see the logic rather than take it on trust.
          </p>
          <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Idea</th>
                  <th className="px-4 py-2 font-medium">What Atlas does</th>
                  <th className="px-4 py-2 font-medium">Where you can see it</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {RESEARCH.map((r) => (
                  <tr key={r.idea} className="border-t border-line align-top">
                    <td className="px-4 py-3 font-medium">{r.idea}</td>
                    <td className="px-4 py-3 text-muted">{r.how}</td>
                    <td className="px-4 py-3 text-muted">{r.see}</td>
                    <td className="px-4 py-3">
                      <a href={r.href} className="text-accent underline" {...(r.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {r.source}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-2xl text-xs text-muted text-pretty">
            Not used yet: a separate reranking model (NVIDIA&apos;s rerank endpoints were unavailable on the account used to build this), so results are fused by RRF and read directly by the LLM. Anthropic&apos;s
            larger 67% gain includes reranking.
          </p>
        </section>

        <section aria-labelledby="cld">
          <h2 id="cld" className="text-2xl font-semibold tracking-tight">
            Where Cloudinary is used
          </h2>
          <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Capability</th>
                  <th className="px-4 py-2 font-medium">What it does here</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {CLOUDINARY.map(([a, b, c]) => (
                  <tr key={a} className="border-t border-line align-top">
                    <td className="px-4 py-2.5 font-medium">{a}</td>
                    <td className="px-4 py-2.5 text-muted">{b}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="trace" className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 id="trace" className="text-2xl font-semibold tracking-tight">
              Every claim can be traced
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted text-pretty">
              The original file is never edited. Every image you see is a Cloudinary URL made from the original plus a named transformation, for example{' '}
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">c_limit,w_1200,q_auto,f_auto</code>. Each time an image appears in a report, the original&apos;s public ID, version and ETag are stored with that
              transformation, so anyone can re-create the picture and check it matches. Photo credit and licence travel with every image.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">The data model</h2>
            <dl className="mt-3 divide-y divide-line border-y border-line">
              {TABLES.map(([a, b]) => (
                <div key={a} className="grid gap-1 py-2.5 sm:grid-cols-[150px_1fr]">
                  <dt className="font-mono text-[12px]">{a}</dt>
                  <dd className="text-[13px] text-muted text-pretty">{b}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">Every table is protected by row-level security: a signed-in user only sees their own organisation&apos;s rows.</p>
          </div>
        </section>

        <section aria-labelledby="limits">
          <h2 id="limits" className="text-2xl font-semibold tracking-tight">
            What is real and what is not
          </h2>
          <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-muted">
            <li>Photos are real, openly licensed images from Wikimedia Commons. Many have no recorded location, so they are shown as city-wide evidence instead of being guessed onto a site.</li>
            <li>Rainfall and river values are live from Open-Meteo. "Rehearse a storm" uses made-up rainfall and every such report says so at the top.</li>
            <li>A before/after pair is a true change over time only when both photos are from the same site. Otherwise it is labelled a visual reference.</li>
            <li>Vectors are compared inside the app, which is fine for thousands of photos. For millions, move them to pgvector with an HNSW index.</li>
            <li>Contacts in the demo are placeholders on example.org addresses. Replace them before sending.</li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted">Impact Atlas &middot; Built for CodeFibonacci x Cloudinary</div>
      </footer>
    </div>
  );
}
