import type { MediaAsset, VisionResult, VisionSignals } from '@/lib/domain';
import { DEFAULT_NVIDIA_MODEL } from '@/lib/ai/llm';
import { isNvidiaConfigured, messageText, modelChain, nvidiaChatWithFallback, thinkingOff } from '@/lib/ai/nvidia';
import { derive } from '@/lib/cloudinary/urls';

/**
 * Vision provider chain (order configurable with VISION_PROVIDERS, default below).
 *   1. Cloudinary AI Vision (Analyze API)  - needs the AI Vision add-on on the Cloudinary account
 *   2. NVIDIA vision-language model        - needs NVIDIA_API_KEY
 *   3. Metadata heuristic                  - always available; clearly labelled as low-confidence
 * The first provider that succeeds wins. Failures are logged into `raw` for transparency.
 */

const DEFAULT_ORDER = ['cloudinary', 'nvidia', 'heuristic'];
const providerCooldown = new Map<string, number>();

const EMPTY_SIGNALS: VisionSignals = {
  water_visible: false,
  blocked_drain: false,
  garbage: false,
  structures_submerged: false,
  people_at_risk: false,
  river_overflow: false,
};

// Four prompts keep token use low (the free AI Vision quota is 100,000 tokens) and give better precision
// than one yes/no question per signal.
const SIGNAL_KEYS = ['blocked_drain', 'garbage', 'submerged_structures', 'people_at_risk', 'river_overflow', 'standing_water'] as const;
const PROMPTS = [
  'Describe this scene in one factual sentence. Mention water, roads, buildings and vehicles if visible.',
  'Rate flood severity as a single digit: 0 = no flooding (a river, lake or sea at its normal level is 0), 1 = minor puddles or unusually high water still within banks, 2 = roads or fields waterlogged, 3 = severe flooding with submerged buildings or vehicles. Answer only the digit.',
  `Which of these are CLEARLY visible? Answer with a comma-separated subset of: ${SIGNAL_KEYS.join(', ')}. Answer "none" if none are clearly visible. Do not guess.`,
  'List up to 8 short lowercase tags for the main objects and conditions, comma separated.',
];

const yes = (s: string) => /^\s*(yes|true|y)\b/i.test(s);
const clampSeverity = (n: number): 0 | 1 | 2 | 3 => (Math.max(0, Math.min(3, Math.round(n))) as 0 | 1 | 2 | 3);

function splitTags(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .split(/[,\n;]/)
        .map((t) => t.replace(/^[\s\-\d.]+/, '').replace(/[^a-z0-9 \-]/g, '').trim())
        .filter((t) => t.length > 1 && t.length <= 30)
    )
  ).slice(0, 10);
}

/** Find the list of answers in Cloudinary's response without depending on exact field names. */
function extractAnswers(json: unknown, expected: number): string[] | null {
  const seen = new Set<unknown>();
  let found: string[] | null = null;
  const textOf = (item: unknown): string | null => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      for (const k of ['response', 'answer', 'value', 'text', 'result', 'content']) {
        if (typeof o[k] === 'string') return o[k] as string;
        if (o[k] != null && typeof o[k] !== 'object') return String(o[k]);
      }
    }
    return null;
  };
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length === expected) {
        const texts = node.map(textOf);
        if (texts.every((t) => t !== null)) {
          found = texts as string[];
          return;
        }
      }
      node.forEach(walk);
    } else {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };
  walk(json);
  return found;
}

function fromAnswers(
  a: string[],
  provider: VisionResult['provider'],
  model: string,
  raw: unknown
): VisionResult {
  const sevMatch = a[1]?.match(/[0-3]/);
  const listed = new Set((a[2] ?? '').toLowerCase().split(/[,\n;]/).map((t) => t.trim().replace(/\s+/g, '_')));
  const has = (k: string) => listed.has(k);
  const water = has('standing_water') || (sevMatch ? Number(sevMatch[0]) >= 1 : false);
  const severity = clampSeverity(sevMatch ? Number(sevMatch[0]) : water ? 2 : 0);
  const signals: VisionSignals = {
    water_visible: water,
    blocked_drain: has('blocked_drain'),
    garbage: has('garbage'),
    structures_submerged: has('submerged_structures'),
    people_at_risk: has('people_at_risk'),
    river_overflow: has('river_overflow'),
  };
  const tags = splitTags(a[3] ?? '');
  return {
    provider,
    model,
    caption: (a[0] ?? '').trim().slice(0, 400),
    tags,
    objects: tags,
    severity,
    signals,
    confidence: 0.8,
    raw,
  };
}

const MIN_TOKENS_LEFT = 3500;
function quotaState(): { remaining: number | null } {
  const g = globalThis as unknown as { __cldVisionQuota?: { remaining: number | null } };
  return (g.__cldVisionQuota ??= { remaining: null });
}

async function viaCloudinary(asset: MediaAsset): Promise<VisionResult> {
  const q = quotaState();
  if (q.remaining !== null && q.remaining < MIN_TOKENS_LEFT) {
    throw new Error(`Cloudinary AI Vision free quota nearly used up (${q.remaining} tokens left)`);
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) throw new Error('Cloudinary credentials missing');

  const res = await fetch(`https://api.cloudinary.com/v2/analysis/${cloud}/analyze/ai_vision_general`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: { uri: derive(asset.cloudinary_url, 'analysis') },
      prompts: PROMPTS,
    }),
    signal: AbortSignal.timeout(40_000),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403) providerCooldown.set('cloudinary', Date.now() + 10 * 60_000);
    throw new Error(`Cloudinary AI Vision ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text);
  const left = json?.limits?.addons_quota?.find?.((x: { type: string }) => x.type === 'ai_vision')?.remaining;
  if (typeof left === 'number') q.remaining = left;
  const answers = extractAnswers(json, PROMPTS.length);
  if (!answers) throw new Error('Could not read Cloudinary AI Vision response shape');
  return fromAnswers(answers, 'cloudinary-ai-vision', 'ai_vision_general', json);
}

async function viaNvidia(asset: MediaAsset): Promise<VisionResult> {
  if (!isNvidiaConfigured()) throw new Error('No NVIDIA API key configured');
  // Send a small Cloudinary-optimised derivative, not the original.
  const imgRes = await fetch(derive(asset.cloudinary_url, 'nvidia'), { signal: AbortSignal.timeout(20_000) });
  if (!imgRes.ok) throw new Error(`Could not fetch image derivative (${imgRes.status})`);
  const b64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

  const instruction =
    'You are a flood-monitoring analyst. Look at the image and answer ONLY with minified JSON of this shape: ' +
    '{"caption":string,"flood_severity":0|1|2|3,"water_visible":boolean,"blocked_drain":boolean,"garbage":boolean,' +
    '"structures_submerged":boolean,"people_at_risk":boolean,"river_overflow":boolean,"tags":string[]}. ' +
    'Severity: 0 none, 1 minor puddles or high river within banks, 2 roads/fields waterlogged, 3 severe flooding with submerged buildings or vehicles. ' +
    'caption is one factual sentence. tags are up to 8 short lowercase words. No prose, no markdown.';

  const { data, model } = await nvidiaChatWithFallback(
    modelChain(process.env.NVIDIA_VISION_MODEL, process.env.NVIDIA_VISION_MODELS, [
      DEFAULT_NVIDIA_MODEL,
    ]),
    (model) => ({
      model,
      temperature: 0.1,
      max_tokens: 500,
      ...thinkingOff(model),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
    }),
    { timeoutMs: 40_000, maxAttempts: 4 }
  );
  const content = messageText(data);
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('NVIDIA vision returned no JSON');
  const j = JSON.parse(m[0]);
  const tags = Array.isArray(j.tags) ? splitTags(j.tags.join(',')) : [];
  return {
    provider: 'nvidia-vlm',
    model,
    caption: String(j.caption ?? '').slice(0, 400),
    tags,
    objects: tags,
    severity: clampSeverity(Number(j.flood_severity ?? 0)),
    signals: {
      water_visible: Boolean(j.water_visible),
      blocked_drain: Boolean(j.blocked_drain),
      garbage: Boolean(j.garbage),
      structures_submerged: Boolean(j.structures_submerged),
      people_at_risk: Boolean(j.people_at_risk),
      river_overflow: Boolean(j.river_overflow),
    },
    confidence: 0.75,
    raw: j,
  };
}

/** Last-resort provider: infer from the source's own title / description. Marked low-confidence. */
export function viaMetadata(asset: MediaAsset): VisionResult {
  const text = `${asset.title ?? ''} ${asset.description ?? ''} ${asset.event_label ?? ''} ${asset.original_filename}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => text.includes(x));

  const flood = has('flood', 'inundat', 'submerg', 'water logging', 'waterlogging', 'waterlogged', 'marooned');
  const severe = has('aerial', 'submerg', 'marooned', 'boat', 'rescue', 'inundat', 'michaung', 'nivar');
  let severity: 0 | 1 | 2 | 3 = 0;
  if (asset.phase === 'DURING' || flood) severity = severe ? 3 : 2;
  else if (has('overflow', 'high tide', 'swollen', 'monsoon', 'rain')) severity = 1;

  const tags = new Set<string>(['chennai']);
  const dict: Record<string, string> = {
    flood: 'flooding', inundat: 'flooding', 'water logging': 'waterlogging', waterlogging: 'waterlogging',
    aerial: 'aerial view', boat: 'boat rescue', rescue: 'rescue', road: 'road', bridge: 'bridge', river: 'river',
    creek: 'creek', canal: 'canal', marsh: 'wetland', lake: 'lake', garbage: 'garbage', waste: 'waste',
    house: 'houses', apartment: 'apartments', street: 'street', drain: 'drain', estuary: 'estuary',
  };
  for (const [k, v] of Object.entries(dict)) if (text.includes(k)) tags.add(v);
  if (severity >= 2) tags.add('flooding');

  const first = (asset.description || asset.title || asset.original_filename || '').split(/(?<=[.!?])\s/)[0];
  return {
    provider: 'metadata-heuristic',
    model: 'keyword-rules-v1',
    caption: first.slice(0, 300),
    tags: Array.from(tags).slice(0, 10),
    objects: [],
    severity,
    signals: {
      ...EMPTY_SIGNALS,
      water_visible: severity >= 1,
      structures_submerged: severity === 3,
      river_overflow: has('overflow'),
      garbage: has('garbage', 'waste', 'plastic'),
      blocked_drain: has('blocked drain', 'clogged'),
    },
    confidence: 0.4,
    raw: { note: 'Inferred from source metadata; no image model was available.' },
  };
}

export async function analyzeImage(asset: MediaAsset): Promise<{ result: VisionResult; attempts: string[] }> {
  const order = (process.env.VISION_PROVIDERS || DEFAULT_ORDER.join(',')).split(',').map((s) => s.trim());
  const attempts: string[] = [];
  for (const name of order) {
    if ((providerCooldown.get(name) ?? 0) > Date.now()) {
      attempts.push(`${name}: skipped (recent auth failure)`);
      continue;
    }
    try {
      if (name === 'cloudinary') return { result: await viaCloudinary(asset), attempts };
      if (name === 'nvidia') return { result: await viaNvidia(asset), attempts };
      if (name === 'heuristic') return { result: viaMetadata(asset), attempts };
    } catch (e) {
      attempts.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { result: viaMetadata(asset), attempts };
}
