import { CheckCircle, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { url } from '@/lib/landing-data';

const STEPS = ['Upload', 'Record', 'Understand', 'Organise', 'Index'];

/**
 * The product moment for the hero: a real Chennai photo becoming evidence, in the order the app does it.
 * Pure CSS animation (9 s loop). With reduced motion, the finished state is shown.
 */
export function HeroMoment() {
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-label="Animated example: a flood photo is read, tagged, filed and made searchable">
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(15,60,45,0.45)]">
        <div className="relative aspect-[4/4.6]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url.hero} alt="Rescuers on an orange raft in a flooded Chennai street, seen from above" className="size-full object-cover" width={900} height={1100} fetchPriority="high" />
          <div className="hm-scan" aria-hidden />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />
          <div className="hm hm-1 absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <span className="font-mono">IMG_2231.jpg</span> stored on Cloudinary, original untouched
          </div>

          <div className="hm hm-0 absolute inset-x-3 bottom-3 space-y-2 rounded-2xl bg-black/70 p-3.5 text-white backdrop-blur-md">
            <p className="hm hm-2 text-[13px] leading-snug">Rescue operation on an orange raft in deep floodwater between submerged buildings and power lines.</p>
            <ul className="hm hm-3 flex flex-wrap gap-1.5" aria-label="AI tags">
              {['flooding', 'rescue boat', 'submerged buildings', 'utility wires'].map((t) => (
                <li key={t} className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                  {t}
                </li>
              ))}
            </ul>
            <div className="hm hm-4 flex items-center gap-2.5">
              <span className="text-[11px] font-medium text-white/80">Severity</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                <span className="hm-bar block h-full w-full rounded-full bg-[#ff6b78]" />
              </span>
              <span className="font-mono text-[11px] font-semibold">3 / 3</span>
            </div>
            <p className="hm hm-5 text-[11px] text-white/80">
              Filed under <b className="text-white">Velachery</b> · during · Cyclone Michaung 2023
            </p>
          </div>
        </div>

        <ol className="grid grid-cols-5 gap-1 border-t border-line bg-surface px-3 py-2.5 text-[10.5px] font-medium text-muted" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span className={`hm hm-${Math.min(i + 1, 6)} inline-grid`}>
                <CheckCircle size={13} weight="fill" className="text-accent" />
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="hm hm-6 absolute -bottom-5 -right-2 w-[78%] rounded-2xl border border-line bg-surface p-3 shadow-xl sm:-right-8">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <Sparkle size={12} weight="fill" className="text-accent" /> Ask
        </p>
        <p className="mt-0.5 text-[13px] font-medium">Where did rescue boats work during Michaung?</p>
        <p className="mt-1 text-[12px] text-muted">
          Velachery, near Viduthalai Nagar{' '}
          <span className="mx-0.5 rounded bg-accent-soft px-1 font-mono text-[11px] font-semibold text-accent">1</span>
          <span className="rounded bg-accent-soft px-1 font-mono text-[11px] font-semibold text-accent">2</span>
        </p>
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-low-soft px-1.5 py-0.5 text-[11px] font-medium">
          <CheckCircle size={12} weight="fill" className="text-low" /> Checked against your evidence
        </p>
      </div>
    </div>
  );
}
