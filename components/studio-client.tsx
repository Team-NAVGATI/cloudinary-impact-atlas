'use client';

import Link from 'next/link';
import { ArrowRight, ChatCircleText, Files, ImageSquare, UploadSimple, X } from '@phosphor-icons/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { PipelineSteps, type PipelineStep } from '@/components/pipeline';
import { Badge, Button, fieldClass, Label, Notice, SeverityChip } from '@/components/ui';
import { derive } from '@/lib/cloudinary/urls';
import { ALLOWED_MIME_TYPES, MEDIA_LIMITS } from '@/lib/constants/media';
import { readNdjson } from '@/lib/ndjson';
import { cn, formatBytes } from '@/lib/utils';

export interface SampleAsset {
  id: string;
  title: string;
  original: string;
  thumb: string;
  phase: string;
}

interface Outcome {
  assetId: string;
  provider: string;
  model: string;
  caption: string;
  severity: number;
  confidence: number;
  signals: Record<string, boolean>;
  tags: string[];
  zone: string | null;
  zoneReason: string | null;
  cloudinarySynced: boolean;
  delivery: { transformation: string; url: string; bytes: number | null; format: string | null; originalBytes: number | null; savedPct: number | null };
}

interface CloudInfo {
  public_id: string;
  asset_id: string | null;
  version: number | null;
  secure_url: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
}

interface Item {
  key: string;
  name: string;
  size: number | null;
  localUrl: string;
  isSample: boolean;
  status: 'queued' | 'running' | 'done' | 'error';
  steps: PipelineStep[];
  cloud?: CloudInfo;
  recordId?: string;
  outcome?: Outcome;
  understand?: Partial<Outcome>;
  organise?: { zone: string | null; reason: string; phase: string };
  error?: string;
}

const STEP_DEFS: { id: string; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'record', label: 'Record' },
  { id: 'understand', label: 'Understand' },
  { id: 'organise', label: 'Organise' },
  { id: 'index', label: 'Index' },
];

const PROVIDER_LABEL: Record<string, string> = {
  'cloudinary-ai-vision': 'Cloudinary AI Vision',
  'nvidia-vlm': 'NVIDIA vision model',
  'metadata-heuristic': 'Source-description rules',
};

const SIGNALS: Record<string, string> = {
  water_visible: 'Water visible',
  blocked_drain: 'Blocked drain',
  garbage: 'Garbage',
  structures_submerged: 'Structures submerged',
  people_at_risk: 'People at risk',
  river_overflow: 'River overflow',
};

const freshSteps = (): PipelineStep[] => STEP_DEFS.map((s) => ({ ...s, status: 'idle' as const }));

function mimeOf(file: File): string {
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.mp4')) return 'video/mp4';
  return file.type;
}

function xhrUpload(url: string, fd: FormData, onProgress: (pct: number) => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      try {
        const j = JSON.parse(x.responseText);
        x.status >= 200 && x.status < 300 ? resolve(j) : reject(new Error(j?.error?.message ?? `Cloudinary rejected the upload (${x.status})`));
      } catch {
        reject(new Error('Unexpected reply from Cloudinary'));
      }
    };
    x.onerror = () => reject(new Error('Network error while uploading'));
    x.send(fd);
  });
}

export function StudioClient({
  zones,
  samples,
  hasData,
}: {
  zones: { id: string; name: string }[];
  samples: SampleAsset[];
  hasData: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [zone, setZone] = useState('');
  const [phase, setPhase] = useState('DURING');
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const settings = useRef({ zone: '', phase: 'DURING' });
  settings.current = { zone, phase };

  const patch = useCallback((key: string, p: Partial<Item> | ((it: Item) => Partial<Item>)) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it)));
  }, []);

  const setStep = useCallback(
    (key: string, id: string, status: PipelineStep['status'], detail?: string, ms?: number) => {
      patch(key, (it) => ({
        steps: it.steps.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail, ms: ms ?? s.ms } : s)),
      }));
    },
    [patch]
  );

  const run = useCallback(
    async (key: string, source: { file?: File; url?: string; name: string }) => {
      const t0 = Date.now();
      const { zone: zoneId, phase: ph } = settings.current;
      patch(key, { status: 'running' });
      let step = 'upload';
      try {
        // 1. Upload straight to Cloudinary with a one-time signature
        setStep(key, 'upload', 'active', 'Asking for a secure upload slot…');
        const sigRes = await fetch('/api/cloudinary/signature', { method: 'POST' });
        const sig = await sigRes.json();
        if (!sigRes.ok || !sig.success) throw new Error(sig.error?.message ?? 'Could not authorise the upload');
        const { signature, timestamp, cloud_name, api_key, folder, public_id } = sig.data;

        const isVideo = source.file ? mimeOf(source.file).startsWith('video/') : false;
        const fd = new FormData();
        fd.append('file', source.file ?? source.url!);
        fd.append('api_key', api_key);
        fd.append('timestamp', String(timestamp));
        fd.append('signature', signature);
        fd.append('folder', folder);
        fd.append('public_id', public_id);
        const up = (await xhrUpload(`https://api.cloudinary.com/v1_1/${cloud_name}/${isVideo ? 'video' : 'image'}/upload`, fd, (pct) =>
          setStep(key, 'upload', 'active', `Sending to Cloudinary… ${pct}%`)
        )) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        const cloud: CloudInfo = {
          public_id: up.public_id,
          asset_id: up.asset_id ?? null,
          version: up.version ?? null,
          secure_url: up.secure_url,
          bytes: up.bytes ?? null,
          width: up.width ?? null,
          height: up.height ?? null,
          format: up.format ?? null,
        };
        patch(key, { cloud });
        setStep(key, 'upload', 'done', `${cloud.width}×${cloud.height} · ${formatBytes(cloud.bytes)} stored, original untouched`, Date.now() - t0);

        // 2. Record
        step = 'record';
        const t1 = Date.now();
        setStep(key, 'record', 'active', 'Saving IDs, version and ETag…');
        const mime = source.file ? mimeOf(source.file) : 'image/jpeg';
        const save = await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cloudinary_public_id: up.public_id,
            cloudinary_url: up.secure_url,
            cloudinary_asset_id: up.asset_id ?? null,
            version: up.version ?? null,
            etag: up.etag ?? null,
            resource_type: isVideo ? 'video' : 'image',
            original_filename: source.name,
            title: source.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 190),
            mime_type: mime,
            file_size: up.bytes ?? source.file?.size ?? null,
            width: up.width ?? null,
            height: up.height ?? null,
            zone_id: zoneId || null,
            phase: ph,
          }),
        });
        const saved = await save.json();
        if (!save.ok || !saved.success) throw new Error(saved.error?.message ?? 'Could not save the record');
        const assetId: string = saved.data.id;
        patch(key, { recordId: assetId });
        setStep(key, 'record', 'done', `Filed as ${assetId.slice(0, 8)}, phase ${ph.toLowerCase()}`, Date.now() - t1);

        if (isVideo) {
          for (const s of ['understand', 'organise', 'index']) setStep(key, s, 'done', s === 'understand' ? 'Videos get a poster frame; frame analysis comes next.' : undefined);
          patch(key, { status: 'done' });
          return;
        }

        // 3-5. Understand, Organise, Index (real events streamed from the server)
        step = 'understand';
        const t2 = Date.now();
        setStep(key, 'understand', 'active', 'Reading the image with AI…');
        const res = await fetch(`/api/assets/${assetId}/analyze?stream=1`, { method: 'POST' });
        if (!res.ok || !res.body) throw new Error('Analysis could not start');
        let last = t2;
        await readNdjson<{ type: string; step?: string; ms?: number; data?: Record<string, any>; message?: string }>(res, (ev) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const now = Date.now();
          if (ev.type === 'step' && ev.step === 'understand') {
            const d = ev.data!;
            patch(key, { understand: d as Partial<Outcome> });
            setStep(key, 'understand', 'done', `${PROVIDER_LABEL[d.provider] ?? d.provider}: severity ${d.severity} of 3`, now - last);
            setStep(key, 'organise', 'active', 'Matching a site and saving the analysis…');
            last = now;
          } else if (ev.type === 'step' && ev.step === 'organise') {
            const d = ev.data!;
            patch(key, { organise: d as Item['organise'] });
            setStep(key, 'organise', 'done', d.zone ? `${d.zone}. ${d.reason}` : d.reason, now - last);
            setStep(key, 'index', 'active', 'Tagging on Cloudinary and updating search…');
            last = now;
          } else if (ev.type === 'step' && ev.step === 'index') {
            const d = ev.data!;
            setStep(key, 'index', 'done', `${(d.tags as string[]).length} tags, ${d.semantic?.indexed ? 'text + image vectors' : 'no vectors'}${d.cloudinarySynced ? ', synced to Cloudinary' : ''}`, now - last);
          } else if (ev.type === 'done') {
            patch(key, { outcome: ev.data as unknown as Outcome, status: 'done' });
          } else if (ev.type === 'error') {
            throw new Error(ev.message ?? 'Analysis failed');
          }
        });
        patch(key, (it) => (it.status === 'running' ? { status: 'done' } : {}));
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Something went wrong';
        setStep(key, step, 'error', message);
        patch(key, { status: 'error', error: message });
      }
    },
    [patch, setStep]
  );

  const start = useCallback(
    (entries: { file?: File; url?: string; name: string; size: number | null; preview: string; sample?: boolean }[]) => {
      setNote(null);
      const fresh: Item[] = entries.map((e) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: e.name,
        size: e.size,
        localUrl: e.preview,
        isSample: Boolean(e.sample),
        status: 'queued',
        steps: freshSteps(),
      }));
      setItems((prev) => [...fresh, ...prev]);
      setSelected(fresh[0]?.key ?? null);
      (async () => {
        for (let i = 0; i < fresh.length; i++) await run(fresh[i].key, { file: entries[i].file, url: entries[i].url, name: entries[i].name });
      })();
    },
    [run]
  );

  function onFiles(files: File[]) {
    const ok: File[] = [];
    for (const f of files) {
      const mime = mimeOf(f);
      const video = mime.startsWith('video/');
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
        setNote(`${f.name}: use JPG, PNG, WEBP or MP4.`);
        continue;
      }
      if (f.size > (video ? MEDIA_LIMITS.VIDEO_MAX_BYTES : MEDIA_LIMITS.IMAGE_MAX_BYTES)) {
        setNote(`${f.name}: too large. Photos up to 10 MB, videos up to 100 MB.`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length) start(ok.map((f) => ({ file: f, name: f.name, size: f.size, preview: URL.createObjectURL(f) })));
  }

  function useSample(s: SampleAsset) {
    start([{ url: s.original, name: `Sample ${s.title}`, size: null, preview: derive(s.original, 'card'), sample: true }]);
  }

  const current = useMemo(() => items.find((i) => i.key === selected) ?? null, [items, selected]);

  return (
    <div className="grid gap-4 lg:h-[calc(100dvh-8.75rem)] lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
      {/* Left: intake */}
      <section className="flex min-h-0 flex-col gap-3" aria-label="Add evidence">
        <div
          data-tour="drop"
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFiles(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            'rounded-card border border-dashed bg-surface p-5 text-center transition-colors',
            drag ? 'border-accent bg-accent-soft' : 'border-line'
          )}
        >
          <UploadSimple size={26} className="mx-auto text-accent" aria-hidden />
          <p className="mt-2 text-[14px] font-semibold">Drop photos or video here</p>
          <p className="mt-0.5 text-xs text-muted">JPG, PNG, WEBP up to 10&nbsp;MB &middot; MP4 up to 100&nbsp;MB</p>
          <Button variant="primary" className="mt-3" onClick={() => input.current?.click()}>
            Choose files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4"
            className="sr-only"
            aria-label="Choose files to upload"
            onChange={(e) => {
              onFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <div className="mt-4 grid grid-cols-2 gap-2 text-left">
            <div>
              <Label htmlFor="st-zone">Site</Label>
              <select id="st-zone" className={cn(fieldClass, 'h-8 text-[13px]')} value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="">Let AI decide</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="st-phase">Shows</Label>
              <select id="st-phase" className={cn(fieldClass, 'h-8 text-[13px]')} value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="BEFORE">Normal (before)</option>
                <option value="DURING">Event (during)</option>
                <option value="AFTER">Recovery (after)</option>
              </select>
            </div>
          </div>
        </div>

        {note && <Notice tone="warn">{note}</Notice>}

        {samples.length > 0 && (
          <div data-tour="samples" className="rounded-card border border-line bg-surface p-3">
            <p className="text-xs font-medium text-muted">No file at hand? Try a sample from the Chennai set</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {samples.map((s) => (
                <button
                  key={s.id}
                  onClick={() => useSample(s)}
                  className="press group relative aspect-[4/3] overflow-hidden rounded-field border border-line"
                  title={s.title}
                  aria-label={`Use sample: ${s.title}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb} alt="" className="size-full object-cover transition-transform duration-200 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-left text-[10px] font-medium text-white">
                    {s.phase === 'BEFORE' ? 'Normal day' : 'Flood'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-[13px] font-semibold">This session</h2>
            <span className="text-xs text-muted">{items.length} item{items.length === 1 ? '' : 's'}</span>
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-[13px] text-muted text-pretty">
              {hasData ? 'Items you add appear here. Your existing evidence is in the Library.' : 'Nothing added yet.'}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {items.map((it) => (
                <li key={it.key}>
                  <button
                    onClick={() => setSelected(it.key)}
                    aria-current={selected === it.key}
                    className={cn('press flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2', selected === it.key && 'bg-accent-soft')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.localUrl} alt="" className="size-10 shrink-0 rounded-md border border-line object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{it.name}</span>
                      <span className="block text-xs text-muted">
                        {it.status === 'done' ? 'Ready' : it.status === 'error' ? 'Needs attention' : it.status === 'queued' ? 'Waiting' : (it.steps.find((s) => s.status === 'active')?.label ?? 'Working') + '…'}
                      </span>
                    </span>
                    {it.status === 'done' && <SeverityChip severity={it.outcome?.severity ?? it.understand?.severity} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Right: live pipeline */}
      <section className="flex min-h-0 flex-col gap-3" aria-label="Live pipeline" aria-live="polite">
        {!current ? <EmptyPipeline /> : <LivePipeline item={current} onDismiss={() => setSelected(null)} />}
      </section>
    </div>
  );
}

function EmptyPipeline() {
  return (
    <div className="flex min-h-[420px] flex-1 flex-col justify-center rounded-card border border-dashed border-line bg-surface p-8">
      <p className="text-xs font-medium text-accent">Live pipeline</p>
      <h2 className="mt-1 max-w-lg text-2xl font-semibold tracking-tight text-balance">Add a photo and watch it turn into evidence</h2>
      <p className="mt-2 max-w-lg text-[14px] text-muted text-pretty">
        Each photo is stored untouched, read by AI, filed under a site and phase, and made searchable. You will see every step and every piece of
        metadata appear here as it happens.
      </p>
      <div className="mt-6">
        <PipelineSteps steps={freshSteps().map((s, i) => ({ ...s, detail: ['Straight to Cloudinary', 'IDs, version, ETag', 'Caption, severity, signals', 'Site, phase, reason', 'Tags and search'][i] }))} direction="horizontal" />
      </div>
    </div>
  );
}

function LivePipeline({ item, onDismiss }: { item: Item; onDismiss: () => void }) {
  const u = item.outcome ?? item.understand;
  const delivered = item.cloud ? derive(item.cloud.secure_url, 'detail') : null;
  const out = item.outcome;
  const finished = item.status === 'done';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold" title={item.name}>
            {item.name}
          </h2>
          <p className="text-xs text-muted">
            {item.status === 'done' ? 'Evidence is ready' : item.status === 'error' ? 'Stopped' : 'Processing in real time'}
            {u?.provider ? ` · ${PROVIDER_LABEL[u.provider] ?? u.provider}` : ''}
          </p>
        </div>
        <button onClick={onDismiss} className="press grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="Close preview">
          <X size={16} />
        </button>
      </div>

      <div data-tour="pipeline">
        <PipelineSteps steps={item.steps} />
      </div>

      {/* Side by side */}
      <div data-tour="compare" className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
        <Frame
          title="Your original"
          meta={item.size ? formatBytes(item.size) : item.isSample ? 'Sample from the Chennai set' : item.cloud?.bytes ? formatBytes(item.cloud.bytes) : ''}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.localUrl} alt="Original upload" className="size-full object-contain" />
        </Frame>
        <Frame
          title="Delivered by Cloudinary"
          meta={
            out?.delivery
              ? `${out.delivery.format?.toUpperCase() ?? ''} · ${formatBytes(out.delivery.bytes)}${out.delivery.savedPct ? ` · ${out.delivery.savedPct}% smaller` : ''}`
              : delivered
                ? 'Measuring…'
                : 'Waiting for upload'
          }
          accent
        >
          {delivered ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={delivered} alt="Version delivered by Cloudinary" className="size-full object-contain" />
              {u?.tags && (
                <ul className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1">
                  {u.tags.slice(0, 6).map((t, i) => (
                    <li key={t} className="rise-in rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ animationDelay: `${i * 70}ms` }}>
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="shimmer size-full" aria-hidden />
          )}
        </Frame>
      </div>

      {/* Metadata that fills in as the pipeline runs */}
      <div data-tour="metadata" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="What the AI sees" wide loading={!u?.caption && item.status !== 'error'}>
          {u?.caption && <p className="line-clamp-3 text-[13px] text-pretty">{u.caption}</p>}
        </Meta>
        <Meta label="Flood severity" loading={u?.severity === undefined && item.status !== 'error'}>
          {u?.severity !== undefined && (
            <div className="space-y-1.5">
              <SeverityChip severity={u.severity} />
              <div className="flex flex-wrap gap-1">
                {Object.entries(SIGNALS)
                  .filter(([k]) => u.signals?.[k])
                  .slice(0, 3)
                  .map(([k, l]) => (
                    <Badge key={k} className="bg-high-soft text-high">
                      {l}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </Meta>
        <Meta label="Filed under" loading={!item.organise && item.status !== 'error'}>
          {item.organise && (
            <p className="text-[13px]">
              <span className="font-medium">{item.organise.zone ?? 'City-wide'}</span>
              <span className="block text-xs text-muted">{item.organise.reason}</span>
            </p>
          )}
        </Meta>
        <Meta label="Traceable to" loading={!item.cloud && item.status !== 'error'}>
          {item.cloud && (
            <p className="text-[13px]">
              <code className="block truncate font-mono text-xs" title={item.cloud.public_id}>
                {item.cloud.public_id.split('/').pop()}
              </code>
              <span className="text-xs text-muted">version {item.cloud.version ?? '—'}</span>
            </p>
          )}
        </Meta>
      </div>

      {item.status === 'error' && <Notice tone="error">{item.error}</Notice>}

      <div data-tour="actions" className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {item.recordId && (
          <Link href={`/assets/${item.recordId}`} className="press inline-flex h-9 items-center gap-2 rounded-field border border-line bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2">
            <ImageSquare size={16} /> Open evidence record
          </Link>
        )}
        <Link
          href={item.recordId ? `/ask?about=${item.recordId}` : '/ask'}
          className={cn(
            'press inline-flex h-9 items-center gap-2 rounded-field px-3.5 text-[13px] font-medium',
            finished ? 'bg-accent text-accent-ink hover:brightness-110' : 'border border-line bg-surface hover:bg-surface-2'
          )}
        >
          <ChatCircleText size={16} /> Ask about this
        </Link>
        <Link
          href={item.recordId ? `/reports?ids=${item.recordId}` : '/reports'}
          className="press inline-flex h-9 items-center gap-2 rounded-field border border-line bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2"
        >
          <Files size={16} /> Put in a report
        </Link>
        <Link href="/library" className="ml-auto inline-flex items-center gap-1 text-[13px] text-accent underline">
          See it in the Library <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function Frame({ title, meta, accent, children }: { title: string; meta?: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <figure className="flex min-h-[200px] min-w-0 flex-col overflow-hidden rounded-field border border-line bg-surface-2">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs">
        <span className={cn('font-medium', accent && 'text-accent')}>{title}</span>
        <span className="truncate font-mono text-[11px] text-muted">{meta}</span>
      </figcaption>
      <div className="relative min-h-0 flex-1">{children}</div>
    </figure>
  );
}

function Meta({ label, children, loading, wide }: { label: string; children?: React.ReactNode; loading?: boolean; wide?: boolean }) {
  return (
    <div className={cn('min-h-[68px] rounded-field border border-line bg-surface px-3 py-2', wide && 'sm:col-span-2 lg:col-span-1')}>
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <div className="mt-1">{loading ? <div className="shimmer h-4 w-3/4 rounded" aria-hidden /> : <div className="rise-in">{children}</div>}</div>
    </div>
  );
}
