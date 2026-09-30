import manifest from '@/data/chennai-manifest.json';
import { derive, storyCardUrl, transformUrl } from '@/lib/cloudinary/urls';

interface M {
  title: string;
  phase: string;
  zone_slug: string | null;
  cloudinary: { secure_url: string; version: number; public_id: string; etag: string; width: number; height: number };
}
const all = manifest as unknown as M[];

const byTitle = (needle: string, fallback = 0) => all.find((m) => m.title.toLowerCase().includes(needle.toLowerCase())) ?? all[fallback];

/** Real, already-uploaded Chennai photos used as landing imagery. Nothing here is stock art. */
export const IMG = {
  boats: byTitle('Boats in Viduthalai'),
  roof: byTitle('Chennai-floods-2015-dec-7'),
  aerialFlood: byTitle('Aerial view of Chennai during floods - 2'),
  aerialCalm: byTitle('West Chennai aerial 3'),
  riverCalm: byTitle('Adyar-river'),
  street: byTitle('Photo of Viduthalai'),
  vehicles: byTitle('Vehicles submerged'),
  inundation: byTitle('Inundation of Chennai in 2017-1'),
};

export const url = {
  hero: transformUrl(IMG.boats.cloudinary.secure_url, 'c_fill,g_auto,w_900,h_1100,q_auto,f_auto'),
  card: (m: M) => derive(m.cloudinary.secure_url, 'card'),
  thumb: (m: M) => derive(m.cloudinary.secure_url, 'thumb'),
  compare: (m: M) => derive(m.cloudinary.secure_url, 'compare'),
  wide: (m: M) => transformUrl(m.cloudinary.secure_url, 'c_fill,g_auto,w_1200,h_760,q_auto,f_auto'),
};

/** A real story card, rendered by Cloudinary from the URL alone (same builder the app uses). */
export const storyDemo = storyCardUrl({
  secureUrl: IMG.roof.cloudinary.secure_url,
  zone: 'Velachery',
  headline: 'Severe flood risk ahead',
  lines: ['350 mm rain expected in 24 hours', 'Chance of rain up to 95%', 'Evidence: rooftop rescue, 2015'],
  riskLabel: 'Severe',
  riskHex: 'C0202F',
}).url;

export const sampleMeta = {
  publicId: IMG.boats.cloudinary.public_id.split('/').pop() ?? '',
  version: IMG.boats.cloudinary.version,
};

const tally = (f: (m: M) => string) => {
  const t = new Map<string, number>();
  for (const m of all) t.set(f(m), (t.get(f(m)) ?? 0) + 1);
  return [...t.entries()].sort((a, b) => b[1] - a[1]);
};
const SITE: Record<string, string> = { adyar: 'Adyar River', cooum: 'Cooum River', pallikaranai: 'Pallikaranai Marsh', velachery: 'Velachery', buckingham: 'Buckingham Canal' };

/** Real counts of the ingested Chennai set (as uploaded, before AI re-filing). */
export const counts = {
  total: all.length,
  sites: tally((m) => (m.zone_slug ? SITE[m.zone_slug] ?? m.zone_slug : 'City-wide')),
  phases: tally((m) => (m.phase === 'BEFORE' ? 'Before / normal' : m.phase === 'DURING' ? 'During event' : m.phase)),
  events: tally((m) => (m as unknown as { event_label: string }).event_label ?? 'Other'),
};
