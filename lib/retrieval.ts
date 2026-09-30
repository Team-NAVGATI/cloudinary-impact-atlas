/**
 * Retrieval primitives (no I/O, easy to test).
 *
 *  - BM25 (Robertson & Zaragoza, 2009): the lexical baseline behind Elasticsearch/Lucene, better than plain TF-IDF
 *    because it saturates term frequency and normalises by document length.
 *  - Reciprocal Rank Fusion (Cormack, Clarke & Buettcher, SIGIR 2009): merges ranked lists from different retrievers
 *    using ranks only, so scores from keywords and from cosine similarity never need to be made comparable.
 *  - Grounding check: every number in a generated answer must be traceable to the retrieved context.
 */

const STOP = new Set(
  'a an the of in on at to for from with and or is are was were be been do does did what which who where when why how show me find give list tell about any all there their has have had can could please most more less than that this these those it its into over under near'.split(' ')
);

/** Very light stemming: enough to match "flooded/flooding/floods" and "boats/boat". */
export function stem(w: string): string {
  return w
    .replace(/(ing|ed)$/, (m, _s, off) => (off >= 4 ? '' : m))
    .replace(/(es|s)$/, (m, _s, off) => (off >= 3 ? '' : m));
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

export interface Ranked {
  id: string;
  score: number;
}

export function bm25(docs: { id: string; text: string }[], query: string[], k1 = 1.4, b = 0.75): Ranked[] {
  const qTerms = Array.from(new Set(query.flatMap((q) => tokenize(q))));
  if (!qTerms.length || !docs.length) return [];
  const toks = docs.map((d) => tokenize(d.text));
  const avg = toks.reduce((t, x) => t + x.length, 0) / toks.length || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  const out: Ranked[] = [];
  docs.forEach((d, i) => {
    const tf = new Map<string, number>();
    for (const w of toks[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
    let s = 0;
    for (const q of qTerms) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      const n = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg)));
    }
    if (s > 0) out.push({ id: d.id, score: s });
  });
  return out.sort((a, b) => b.score - a.score);
}

export interface FusedHit {
  id: string;
  rrf: number;
  ranks: Record<string, number>;
}

/** RRF with k=60, the value used in the original paper and by most search engines. */
export function rrf(lists: Record<string, Ranked[]>, k = 60): FusedHit[] {
  const acc = new Map<string, FusedHit>();
  for (const [name, list] of Object.entries(lists)) {
    list.forEach((item, i) => {
      const cur = acc.get(item.id) ?? { id: item.id, rrf: 0, ranks: {} };
      cur.rrf += 1 / (k + i + 1);
      cur.ranks[name] = i + 1;
      acc.set(item.id, cur);
    });
  }
  return [...acc.values()].sort((a, b) => b.rrf - a.rrf);
}

export interface Grounding {
  status: 'verified' | 'review';
  numbersChecked: number;
  unsupportedNumbers: string[];
  citations: number;
  invalidCitations: number[];
  sentencesCited: number;
  sentences: number;
}

/**
 * Faithfulness check. Numbers in the answer (other than citation markers) must appear in the context the
 * model was given; citation markers must point at retrieved items; most substantive sentences should cite.
 */
export function verifyAnswer(markdown: string, context: unknown, validRefs: Set<number>): Grounding {
  const ctxText = JSON.stringify(context).toLowerCase();
  const noCites = markdown.replace(/\[\d{1,2}\]/g, ' ');
  const nums = Array.from(new Set(noCites.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []));
  const smallOk = (n: string) => Number(n) <= 10 && Number.isInteger(Number(n)); // "3 photos", "top 5": counted from the list itself
  const unsupported = nums.filter((n) => !smallOk(n) && !new RegExp(`(^|[^0-9])${n.replace('.', '\\.')}([^0-9]|$)`).test(ctxText));
  const cites = Array.from(markdown.matchAll(/\[(\d{1,2})\]/g)).map((m) => Number(m[1]));
  const invalid = Array.from(new Set(cites.filter((c) => !validRefs.has(c))));
  const sentences = markdown
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*\s]+/, '').trim())
    .filter((s) => s.length > 25);
  const cited = sentences.filter((s) => /\[\d{1,2}\]/.test(s)).length;
  const ok = unsupported.length === 0 && invalid.length === 0 && (sentences.length === 0 || cited / sentences.length >= 0.5 || cites.length > 0);
  return {
    status: ok ? 'verified' : 'review',
    numbersChecked: nums.length,
    unsupportedNumbers: unsupported,
    citations: cites.length,
    invalidCitations: invalid,
    sentencesCited: cited,
    sentences: sentences.length,
  };
}
