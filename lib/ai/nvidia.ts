/**
 * NVIDIA API client with a rotating key pool.
 *
 * Free NVIDIA keys allow ~40 requests/minute each. With several keys we spread calls across them:
 *   - each request goes to the key with the fewest calls in the last 60 s (a sliding window),
 *   - a key at its limit is skipped; if all are at their limit we wait for the earliest free slot,
 *   - a 429 puts that key on cooldown (Retry-After, default 30 s) and the call is retried on another key,
 *   - a 401/403 marks the key dead for 10 minutes,
 *   - timeouts and 5xx retry on a different key.
 * State lives on globalThis so it survives hot reloads. On serverless hosting each instance keeps its own
 * window, so the per-key limit is set slightly under 40 (NVIDIA_RPM_PER_KEY, default 34).
 */

const WINDOW_MS = 60_000;

interface KeyState {
  id: string;
  key: string;
  hits: number[];
  cooldownUntil: number;
  deadUntil: number;
}

interface Pool {
  signature: string;
  keys: KeyState[];
}

export function readNvidiaKeys(env: NodeJS.ProcessEnv = process.env): { id: string; key: string }[] {
  const found: { id: string; key: string }[] = [];
  const names = Object.keys(env)
    .filter((k) => /^NVIDIA_API_KEY(_\d+)?$/i.test(k))
    .sort((a, b) => (parseInt(a.split('_').pop() ?? '0', 10) || 0) - (parseInt(b.split('_').pop() ?? '0', 10) || 0));
  for (const n of names) if (env[n]?.trim()) found.push({ id: n.toUpperCase(), key: env[n]!.trim() });
  (env.NVIDIA_API_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((k, i) => found.push({ id: `NVIDIA_API_KEYS[${i}]`, key: k }));
  const seen = new Set<string>();
  return found.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
}

function getPool(): Pool {
  const g = globalThis as unknown as { __nvidiaPool?: Pool };
  const keys = readNvidiaKeys();
  const signature = keys.map((k) => k.key.slice(-6)).join('|');
  if (!g.__nvidiaPool || g.__nvidiaPool.signature !== signature) {
    g.__nvidiaPool = {
      signature,
      keys: keys.map((k) => ({ id: k.id, key: k.key, hits: [], cooldownUntil: 0, deadUntil: 0 })),
    };
  }
  return g.__nvidiaPool;
}

export function nvidiaKeyCount(): number {
  return getPool().keys.length;
}

export function isNvidiaConfigured(): boolean {
  return nvidiaKeyCount() > 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rpmLimit = () => Math.max(1, Number(process.env.NVIDIA_RPM_PER_KEY) || 34);

/** Pick the least-loaded usable key and reserve a slot on it. Waits (up to maxWaitMs) if all are busy. */
async function acquire(exclude: Set<string>, maxWaitMs: number): Promise<KeyState> {
  const pool = getPool();
  const start = Date.now();
  for (;;) {
    const now = Date.now();
    let best: KeyState | null = null;
    let soonest = Infinity;
    for (const k of pool.keys) {
      if (exclude.has(k.id) || k.deadUntil > now) continue;
      k.hits = k.hits.filter((t) => now - t < WINDOW_MS);
      const freeAt = Math.max(k.cooldownUntil, k.hits.length >= rpmLimit() ? k.hits[0] + WINDOW_MS : 0);
      if (freeAt <= now) {
        if (!best || k.hits.length < best.hits.length) best = k;
      } else {
        soonest = Math.min(soonest, freeAt);
      }
    }
    if (best) {
      best.hits.push(now);
      return best;
    }
    if (soonest === Infinity) throw new Error('No usable NVIDIA API key (all keys invalid or excluded)');
    if (now - start + (soonest - now) > maxWaitMs) throw new Error('NVIDIA rate limit reached on all keys; try again shortly');
    await sleep(Math.min(soonest - now + 25, 1000));
  }
}

export interface NvidiaChatOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  maxWaitMs?: number;
}

type ChatResponse = { choices?: { message?: { content?: string | null } }[] };

/**
 * POST /chat/completions with key rotation and backoff.
 *  - 429: that key cools down, retry on another key
 *  - 401/403: key marked dead, retry on another key
 *  - 5xx / timeout / network: exponential backoff (NVIDIA's shared endpoint sometimes returns 503 under load)
 *  - other 4xx (retired model, bad payload): throw immediately as `NVIDIA 4xx` so a caller can try another model
 */
export async function nvidiaPost<T = ChatResponse>(path: string, payload: Record<string, unknown>, opts: NvidiaChatOptions = {}): Promise<T> {
  const base = (process.env.NVIDIA_MODEL_ENDPOINT || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
  const total = getPool().keys.length;
  if (!total) throw new Error('No NVIDIA API key configured (set NVIDIA_API_KEY_1 ... NVIDIA_API_KEY_5)');

  const attempts = opts.maxAttempts ?? Math.max(3, total);
  const excluded = new Set<string>();
  let lastError = 'NVIDIA request failed';

  for (let i = 0; i < attempts; i++) {
    let k: KeyState;
    try {
      k = await acquire(excluded, opts.maxWaitMs ?? 20_000);
    } catch (e) {
      // every key is excluded or busy: allow keys back in once, else give up
      if (excluded.size && i < attempts - 1) {
        excluded.clear();
        await sleep(1200);
        continue;
      }
      throw e;
    }
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${k.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.text()).slice(0, 240);
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        k.cooldownUntil = Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 30_000);
        excluded.add(k.id);
        lastError = `${k.id} rate limited (429)`;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        k.deadUntil = Date.now() + 10 * 60_000;
        excluded.add(k.id);
        lastError = `${k.id} rejected (${res.status})`;
        continue;
      }
      if (res.status >= 500 || res.status === 408) {
        lastError = `NVIDIA ${res.status}: ${body}`;
        await sleep(Math.min(6000, 700 * 2 ** i) + Math.random() * 300);
        continue;
      }
      throw new Error(`NVIDIA ${res.status}: ${body}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/^NVIDIA 4\d\d/.test(msg)) throw e;
      lastError = `${k.id}: ${msg}`;
      await sleep(Math.min(4000, 500 * 2 ** i));
    }
  }
  throw new Error(lastError);
}

export function nvidiaChat(payload: Record<string, unknown>, opts: NvidiaChatOptions = {}): Promise<ChatResponse> {
  return nvidiaPost<ChatResponse>('/chat/completions', payload, opts);
}

export function modelChain(envOne: string | undefined, envMany: string | undefined, defaults: string[]): string[] {
  const list = [
    ...(envOne ? [envOne.trim()] : []),
    ...(envMany ? envMany.split(',').map((s) => s.trim()) : []),
    ...defaults,
  ].filter(Boolean);
  return Array.from(new Set(list));
}

/**
 * Model health. A model that is retired (404/410) is skipped for an hour; one that times out is skipped for
 * five minutes, so a dead entry in the chain can never stall every request.
 */
function health(): Map<string, number> {
  const g = globalThis as unknown as { __nvidiaModelHealth?: Map<string, number> };
  return (g.__nvidiaModelHealth ??= new Map());
}

/** Try each healthy model in order until one answers. Returns which model produced the answer. */
export async function nvidiaChatWithFallback(
  models: string[],
  build: (model: string) => Record<string, unknown>,
  opts: NvidiaChatOptions = {}
): Promise<{ data: ChatResponse; model: string }> {
  const h = health();
  const now = Date.now();
  const usable = models.filter((m) => (h.get(m) ?? 0) < now);
  let last: unknown = new Error('No healthy NVIDIA model available');
  for (const model of usable.length ? usable : models) {
    try {
      return { data: await nvidiaChat(build(model), opts), model };
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/^NVIDIA (404|410)/.test(msg)) h.set(model, Date.now() + 60 * 60_000);
      else if (/timeout|aborted/i.test(msg)) h.set(model, Date.now() + 5 * 60_000);
    }
  }
  throw last;
}

/** Reasoning models take a flag to skip "thinking"; other models must not receive it. */
export function thinkingOff(model: string): Record<string, unknown> {
  return /nemotron-3/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {};
}

/** Assistant text with any <think>...</think> reasoning removed. */
export function messageText(data: { choices?: { message?: { content?: string | null } }[] }): string {
  const raw = data.choices?.[0]?.message?.content ?? '';
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim();
}
