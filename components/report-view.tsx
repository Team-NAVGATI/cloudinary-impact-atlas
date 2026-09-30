// Server component on purpose: the Markdown is parsed and rendered on the server, so react-markdown, remark and
// rehype never ship to the browser. Only the interactive pieces (the before/after slider) are client components.
import Link from 'next/link';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { Info, Lightbulb, Warning, WarningOctagon } from '@phosphor-icons/react/dist/ssr';
import { CompareSlider } from '@/components/compare-slider';
import { MetricRow, RiskPanel } from '@/components/risk-blocks';
import { cn, type RiskLevel } from '@/lib/utils';

export interface AssetLite {
  id: string;
  title: string;
  thumb: string;
  full: string;
  compare: string;
}

type MdNode = { type: string; value?: string; children?: MdNode[]; data?: Record<string, unknown> };

/** remark plugin: turns GitHub-style alerts (`> [!WARNING]`) into <blockquote data-callout="warning">. */
function remarkCallouts() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (node.type === 'blockquote' && node.children?.[0]?.type === 'paragraph') {
        const first = node.children[0].children?.[0];
        const m = first?.type === 'text' ? first.value?.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*/i) : null;
        if (first && m) {
          first.value = first.value!.slice(m[0].length);
          node.data = { ...(node.data ?? {}), hProperties: { 'data-callout': m[1].toLowerCase() } };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

const CALLOUTS: Record<string, { icon: typeof Info; title: string; cls: string }> = {
  note: { icon: Info, title: 'Note', cls: 'bg-accent-soft text-ink [&_svg]:text-accent' },
  tip: { icon: Lightbulb, title: 'All clear', cls: 'bg-low-soft text-ink [&_svg]:text-low' },
  important: { icon: Info, title: 'Important', cls: 'bg-accent-soft text-ink [&_svg]:text-accent' },
  warning: { icon: Warning, title: 'Warning', cls: 'bg-high-soft text-ink [&_svg]:text-high' },
  caution: { icon: WarningOctagon, title: 'Caution', cls: 'bg-severe-soft text-ink [&_svg]:text-severe' },
};

const OWN_BLOCKS = new Set(['risk', 'metrics', 'compare']);

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

export function ReportView({ markdown, assets }: { markdown: string; assets: Record<string, AssetLite> }) {
  const components: Components = {
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children;
      if (isValidElement(child)) {
        const cls = (child.props as { className?: string }).className ?? '';
        const lang = /language-(\w+)/.exec(cls)?.[1];
        if (lang && OWN_BLOCKS.has(lang)) return <>{children}</>;
      }
      return <pre>{children}</pre>;
    },
    code({ className, children, ...rest }) {
      const lang = /language-(\w+)/.exec(className ?? '')?.[1];
      const raw = textOf(children).trim();
      if (lang === 'risk') {
        const d = safeJson<{ level: RiskLevel; score: number; drivers: never[]; simulated?: boolean }>(raw);
        if (d) return <RiskPanel level={d.level} score={d.score} drivers={d.drivers} simulated={d.simulated} />;
      }
      if (lang === 'metrics') {
        const d = safeJson<{ label: string; value: string; note?: string }[]>(raw);
        if (d) return <MetricRow items={d} />;
      }
      if (lang === 'compare') {
        const d = safeJson<{ before: string; after: string; beforeLabel?: string; afterLabel?: string }>(raw);
        const b = d && assets[d.before];
        const a = d && assets[d.after];
        if (d && a && b) {
          return (
            <div className="not-prose my-6">
              <CompareSlider beforeUrl={b.compare} afterUrl={a.compare} beforeLabel={`Before: ${b.title}`} afterLabel={`After: ${a.title}`} />
              <p className="mt-2 text-xs text-muted">Drag the handle or use the arrow keys to compare. Both crops are identical Cloudinary transformations.</p>
            </div>
          );
        }
      }
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    },
    blockquote(props) {
      const { children, node: _n, ...rest } = props as { children?: ReactNode; node?: unknown } & Record<string, unknown>;
      const kind = String(rest['data-callout'] ?? '');
      const c = CALLOUTS[kind];
      if (!c) return <blockquote>{children}</blockquote>;
      const Icon = c.icon;
      return (
        <aside className={cn('avoid-break not-prose my-5 flex gap-3 rounded-card px-4 py-3 text-[14px] leading-relaxed', c.cls)} role="note">
          <Icon size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 [&_p]:m-0">{children}</div>
        </aside>
      );
    },
    img({ src, alt, title }) {
      const m = typeof src === 'string' ? /^asset:\/\/([0-9a-f-]{36})$/.exec(src) : null;
      const asset = m ? assets[m[1]] : undefined;
      const url = asset?.full ?? (typeof src === 'string' && !src.startsWith('asset://') ? src : '');
      if (!url) return null;
      return (
        <figure className="avoid-break not-prose my-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt ?? asset?.title ?? ''} loading="lazy" className="w-full rounded-card border border-line" />
          <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{title}</span>
            {asset && (
              <Link href={`/assets/${asset.id}`} className="text-accent underline no-print">
                Open evidence record
              </Link>
            )}
          </figcaption>
        </figure>
      );
    },
    p({ children, node }) {
      // A paragraph that only holds an image becomes a <figure>; <figure> cannot live inside <p>.
      const only = node?.children?.length === 1 ? node.children[0] : undefined;
      if (only && 'tagName' in only && only.tagName === 'img') return <>{children}</>;
      return <p>{children}</p>;
    },
    table({ children }) {
      return (
        <div className="avoid-break not-prose my-5 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[520px] border-collapse text-[13px] [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:bg-surface-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted">
            {children}
          </table>
        </div>
      );
    },
    a({ href, children }) {
      const external = href?.startsWith('http');
      return (
        <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {children}
        </a>
      );
    },
    input(props) {
      return <input {...props} disabled className="accent-[var(--accent)]" />;
    },
  };

  return (
    <article className="report-prose prose prose-neutral max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:mt-10 prose-h2:text-xl prose-h3:text-base prose-img:my-0 prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-a:font-medium">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCallouts]}
        rehypePlugins={[rehypeSlug]}
        components={components}
        // Allow our own asset:// references (resolved to Cloudinary URLs above); everything else stays sanitised.
        urlTransform={(url) => (/^asset:\/\/[0-9a-f-]{36}$/.test(url) ? url : defaultUrlTransform(url))}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

export type { ReactElement };
