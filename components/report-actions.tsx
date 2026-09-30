'use client';

import { useRouter } from 'next/navigation';
import { Copy, DownloadSimple, EnvelopeSimple, FilePdf, ImageSquare } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button, LinkButton, Notice, Panel } from '@/components/ui';
import { ActiveBeam, Working } from '@/components/working';

interface ContactLite {
  id: string;
  name: string;
  designation: string;
  email: string;
  zone_id: string | null;
}

interface DispatchResult {
  contact: string;
  email: string;
  status: 'SENT' | 'PREPARED' | 'FAILED';
  error?: string;
  mailto: string;
}

export function ReportActions({
  reportId,
  shareToken,
  storyUrl,
  zoneId,
  contacts,
}: {
  reportId: string;
  shareToken: string;
  storyUrl: string | null;
  zoneId: string | null;
  contacts: ContactLite[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [story, setStory] = useState<string | null>(storyUrl);
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyErr, setStoryErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(contacts.filter((c) => c.zone_id === zoneId).map((c) => c.id));
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ link: string; emailConfigured: boolean; results: DispatchResult[] } | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${shareToken}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', `${window.location.origin}/r/${shareToken}`);
    }
  }

  async function makeStory() {
    setStoryBusy(true);
    setStoryErr(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/story`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Could not build the card');
      setStory(json.data.url);
      router.refresh();
    } catch (e) {
      setStoryErr(e instanceof Error ? e.message : 'Could not build the card');
    } finally {
      setStoryBusy(false);
    }
  }

  async function send() {
    setSending(true);
    setSendErr(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: picked }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Could not send');
      setResults(json.data);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="no-print space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <EnvelopeSimple size={16} /> Send to officer
        </Button>
        <Button onClick={copy}>
          <Copy size={16} /> {copied ? 'Link copied' : 'Copy share link'}
        </Button>
        <Button onClick={() => window.print()}>
          <FilePdf size={16} /> Save as PDF
        </Button>
        <LinkButton href={`/api/reports/${reportId}/markdown`}>
          <DownloadSimple size={16} /> Markdown
        </LinkButton>
        <Button onClick={makeStory} disabled={storyBusy}>
          <ImageSquare size={16} /> {story ? 'Rebuild story card' : 'Story card'}
        </Button>
      </div>

      {open && (
        <ActiveBeam active={sending} radius={12}>
          <Panel className="p-4">
            <h2 className="text-[13px] font-semibold">Who should receive this?</h2>
            <p className="mt-0.5 text-xs text-muted">Recipients get a short email with the risk level and a link to this report.</p>
            <ul className="mt-3 divide-y divide-line rounded-field border border-line">
              {contacts.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={picked.includes(c.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{c.name}</span>
                      <span className="block text-xs text-muted">{c.designation}</span>
                      <span className="block font-mono text-xs text-muted">{c.email}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-3">
              {sending ? (
                <Working label={`Sending…`} state="connecting" />
              ) : (
                <Button variant="primary" onClick={send} disabled={!picked.length}>
                  Send to {picked.length || 'selected'} recipient{picked.length === 1 ? '' : 's'}
                </Button>
              )}
            </div>
            {sendErr && (
              <div className="mt-3">
                <Notice tone="error">{sendErr}</Notice>
              </div>
            )}
            {results && (
              <div className="mt-3 space-y-2">
                {!results.emailConfigured && (
                  <Notice tone="warn">
                    Email delivery is not configured (no RESEND_API_KEY), so nothing was emailed. The alert is logged and the link is ready to send yourself.
                  </Notice>
                )}
                <ul className="space-y-1 text-[13px]">
                  {results.results.map((r) => (
                    <li key={r.email} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {r.contact}:<span className="font-medium">{r.status === 'SENT' ? 'Sent' : r.status === 'PREPARED' ? 'Prepared' : 'Failed'}</span>
                        {r.error ? <span className="text-severe"> ({r.error})</span> : null}
                      </span>
                      {r.status !== 'SENT' && (
                        <a className="text-accent underline" href={r.mailto}>
                          Open in email app
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </ActiveBeam>
      )}

      {storyBusy && <Working label={`Rendering the card with Cloudinary…`} state="composing" />}
      {storyErr && <Notice tone="error">{storyErr}</Notice>}
      {story && !storyBusy && (
        <Panel className="flex flex-wrap items-start gap-4 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={story} alt="Shareable story card for this report" className="w-44 rounded-field border border-line" loading="lazy" />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold">Story card</h2>
            <p className="mt-0.5 max-w-sm text-xs text-muted">
              1080&times;1350 share image built by Cloudinary from the strongest evidence photo: smart crop, dimmed base, text overlays. No extra file is stored.
            </p>
            <a className="mt-2 inline-block text-[13px] text-accent underline" href={story} target="_blank" rel="noopener noreferrer" download>
              Open full size
            </a>
          </div>
        </Panel>
      )}
    </div>
  );
}
