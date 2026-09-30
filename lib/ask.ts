import type { Db } from '@/lib/auth';
import { completeText, sanitizeLlmMarkdown } from '@/lib/ai/llm';
import { isNvidiaConfigured } from '@/lib/ai/nvidia';
import { derive } from '@/lib/cloudinary/urls';
import { loadCollections, type Collections } from '@/lib/collections';
import type { AiAnalysis, MediaAsset, Zone } from '@/lib/domain';
import { denseRank, embed, indexedCount, loadIndex } from '@/lib/embeddings';
import { bm25, rrf, verifyAnswer, type Grounding } from '@/lib/retrieval';
import { computeRisk } from '@/lib/risk';
import { formatDate } from '@/lib/utils';
import { fetchWeather, imdClass } from '@/lib/weather/openmeteo';
import { ASSET_COLS } from '@/lib/columns';

/* -------------------------------------------------------------------------------------------------
 * Ask: natural-language questions over the whole archive.
 *   1. PLAN     the LLM turns the question into filters (keywords, site, phase, severity, what extra data is needed)
 *   2. RETRIEVE full-text + filters over media_assets, plus collection stats, recent reports and live weather if relevant
 *   3. READ     the LLM answers using ONLY that context and cites evidence as [n]
 * Every step degrades to plain rules if the LLM is unavailable, so the feature never dead-ends.
 * ----------------------------------------------------------------------------------------------- */

export interface Plan {
  intent: 'evidence' | 'stats' | 'weather' | 'mixed';
  keywords: string[];
  zoneId: string | null;
  zoneName: string | null;
  phase: 'BEFORE' | 'DURING' | 'AFTER' | null;
  minSeverity: number | null;
  needsWeather: boolean;
  needsReports: boolean;
  by: 'llm' | 'rules';
  /** filters the LLM proposed but the question did not support, so they were not applied */
  dropped?: string[];
}

export interface EvidenceCard {
  n: number;
  id: string;
  title: string;
  caption: string;
  thumb: string;
  severity: number | null;
  site: string | null;
  phase: string;
  date: string | null;
  tags: string[];
  credit: string | null;
  license: string | null;
  sourceUrl: string | null;
  event: string | null;
  matched: { keywords?: number; meaning?: number; visual?: number };
  score: number;
}

const STOP = new Set(
  'a an the of in on at to for from with and or is are was were be been do does did what which who where when why how show me find give list tell about any all there their photos photo pictures picture images image evidence during after before near around has have had can could please most more less than that this these those it its'.split(' ')
);

function rulesPlan(q: string, zones: Zone[]): Plan {
  const low = q.toLowerCase();
  const zone = zones.find((z) => low.includes(z.name.toLowerCase()) || z.keywords.some((k) => k.length > 3 && low.includes(k.toLowerCase())));
  const words = low.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  // Phase / severity are hard filters, so they need explicit wording. "flood" alone is content, not a filter.
  const phase = /\b(before|normal day|normal conditions|usual|baseline|dry season)\b/.test(low)
    ? 'BEFORE'
    : /\b(after the|recovery|recovered|cleanup|clean-up|aftermath)\b/.test(low)
      ? 'AFTER'
      : /\b(during the|at the peak|at its peak)\b/.test(low)
        ? 'DURING'
        : null;
  const minSeverity = /\b(severe|severely|serious|catastrophic|submerged|worst)\b/.test(low) ? 3 : null;
  const needsWeather = /\b(rain|rainfall|forecast|weather|risk|tomorrow|today|next 24|this week)\b/.test(low);
  const needsReports = /\b(report|reports|sent|alert|alerts)\b/.test(low);
  return {
    intent: needsWeather ? 'weather' : /\b(how many|count|number of|total)\b/.test(low) ? 'stats' : 'evidence',
    keywords: words.slice(0, 6),
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    phase: phase as Plan['phase'],
    minSeverity,
    needsWeather,
    needsReports,
    by: 'rules',
  };
}

export async function planQuestion(question: string, zones: Zone[]): Promise<Plan> {
  const fallback = rulesPlan(question, zones);
  const llm = await completeText({
    system:
      'You turn a user question about a photo/video evidence archive into a search plan. Reply with ONLY minified JSON, no prose.',
    user:
      `Question: ${question}\n` +
      'JSON shape: {"intent":"evidence|stats|weather|mixed","keywords":[up to 6 lowercase words or short phrases likely to appear in photo captions or tags],' +
      '"site":"exact site name or null","phase":"before|during|after|null","min_severity":0|1|2|3|null,"needs_weather":boolean,"needs_reports":boolean}',
    maxTokens: 300,
    temperature: 0.1,
  });
  if (!llm) return fallback;
  try {
    const m = llm.text.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m![0]);
    const zone = zones.find((z) => typeof j.site === 'string' && z.name.toLowerCase() === j.site.toLowerCase()) ?? zones.find((z) => typeof j.site === 'string' && j.site.toLowerCase().includes(z.name.split(' ')[0].toLowerCase()));
    const qLow = question.toLowerCase();
    const siteTokens = zones.flatMap((z) => [z.name.toLowerCase(), ...z.keywords.map((k) => k.toLowerCase())]).filter((t) => t.length > 3);
    const kws = (Array.isArray(j.keywords) ? j.keywords : [])
      .map((k: unknown) => String(k).toLowerCase().trim())
      .filter((k: string) => k.length > 1)
      // a keyword that names a site is only kept if the question itself names it
      .filter((k: string) => !siteTokens.some((t) => k.includes(t) || t.includes(k)) || qLow.includes(k))
      .slice(0, 6);
    const ph = typeof j.phase === 'string' ? j.phase.toUpperCase() : null;
    // The LLM may sharpen keywords and wording, but a hard filter is only kept if the question's own words support it
    // (fallback holds exactly what the text supports). This stops invented sites/phases from hiding relevant evidence.
    const dropped: string[] = [];
    if (zone && !fallback.zoneId) dropped.push(`site "${zone.name}"`);
    if (ph && !fallback.phase) dropped.push(`phase "${String(ph).toLowerCase()}"`);
    if (Number.isInteger(j.min_severity) && j.min_severity > 0 && fallback.minSeverity === null) dropped.push(`severity ${j.min_severity}+`);
    if (j.needs_weather && !fallback.needsWeather) dropped.push('live weather');
    return {
      intent: fallback.needsWeather ? (['weather', 'mixed'].includes(j.intent) ? j.intent : 'weather') : ['evidence', 'stats'].includes(j.intent) ? j.intent : fallback.intent,
      keywords: kws.length ? kws : fallback.keywords,
      zoneId: fallback.zoneId,
      zoneName: fallback.zoneName,
      phase: fallback.phase,
      minSeverity: fallback.minSeverity,
      needsWeather: fallback.needsWeather,
      needsReports: fallback.needsReports,
      by: 'llm',
      dropped,
    };
  } catch {
    return fallback;
  }
}

export interface RetrievalTrace {
  method: string;
  candidates: number;
  keywordHits: number;
  meaningHits: number | null;
  visualHits: number | null;
  fused: number;
  indexed: number;
  indexTotal: number;
  persisted: boolean;
  notes: string[];
}

export interface Retrieved {
  evidence: EvidenceCard[];
  stats: Collections;
  reports: { title: string; risk: string; date: string; excerpt: string }[];
  weather: { site: string; rain24Mm: number; imd: string; peakProb: number; risk: string; score: number }[];
  trace: RetrievalTrace;
}

async function captionsFor(db: Db, ids: string[]): Promise<Map<string, { caption: string; signals: Record<string, unknown> }>> {
  const out = new Map<string, { caption: string; signals: Record<string, unknown> }>();
  for (let i = 0; i < ids.length; i += 120) {
    const chunk = ids.slice(i, i + 120);
    const { data } = await db
      .from('ai_analyses')
      .select('media_asset_id, description, environmental_signals, created_at')
      .in('media_asset_id', chunk)
      .order('created_at', { ascending: false });
    for (const a of (data ?? []) as { media_asset_id: string; description: string | null; environmental_signals: Record<string, unknown> }[]) {
      if (!out.has(a.media_asset_id)) out.set(a.media_asset_id, { caption: a.description ?? '', signals: a.environmental_signals ?? {} });
    }
  }
  return out;
}

/**
 * Hybrid retrieval: BM25 keywords + text-meaning vectors + image-content vectors, merged with Reciprocal Rank Fusion.
 * Site / phase / severity from the plan are hard pre-filters applied to every retriever.
 */
export async function retrieve(
  db: Db,
  organizationId: string,
  plan: Plan,
  zones: Zone[],
  fixedIds: string[] = [],
  question = ''
): Promise<Retrieved> {
  const stats = await loadCollections(db, organizationId);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const notes: string[] = [];

  // 1. Candidate pool after hard filters
  let q = db.from('media_assets').select(ASSET_COLS).eq('organization_id', organizationId).neq('status', 'ARCHIVED').limit(1500);
  if (fixedIds.length) q = q.in('id', fixedIds.slice(0, 30));
  else {
    if (plan.zoneId) q = q.eq('zone_id', plan.zoneId);
    if (plan.phase) q = q.eq('phase', plan.phase);
    if (plan.minSeverity !== null) q = q.gte('severity', plan.minSeverity);
  }
  const { data: poolRows } = await q;
  let pool = (poolRows ?? []) as MediaAsset[];
  if (!fixedIds.length && pool.length < 4 && (plan.zoneId || plan.phase || plan.minSeverity !== null)) {
    // Filters were too strict to answer anything; relax them and say so.
    const { data } = await db.from('media_assets').select(ASSET_COLS).eq('organization_id', organizationId).neq('status', 'ARCHIVED').limit(1500);
    pool = (data ?? []) as MediaAsset[];
    notes.push('Filters matched very little, so they were relaxed.');
  }
  const caps = await captionsFor(db, pool.map((p) => p.id));
  const byId = new Map(pool.map((p) => [p.id, p]));

  let ranked: { id: string; rrf: number; ranks: Record<string, number> }[] = [];
  let keywordHits = 0;
  let meaningHits: number | null = null;
  let visualHits: number | null = null;
  const index = await loadIndex(db, organizationId);

  if (fixedIds.length) {
    ranked = pool.map((p, i) => ({ id: p.id, rrf: 1 / (i + 1), ranks: { selection: i + 1 } }));
  } else {
    // 2. Lexical: BM25 over each item's contextual text
    const docs = pool.map((p) => ({
      id: p.id,
      text: `${p.title ?? ''} ${p.location ?? ''} ${p.event_label ?? ''} ${(p.tags ?? []).join(' ')} ${caps.get(p.id)?.caption ?? p.description ?? ''}`,
    }));
    const lex = bm25(docs, [...plan.keywords, question]).slice(0, 40);
    keywordHits = lex.length;

    // 3. Dense: meaning of the text and content of the pixels, when an index and an embedding key exist
    const dense: Record<string, { id: string; score: number }[]> = {};
    const allowed = new Set(pool.map((p) => p.id));
    if (isNvidiaConfigured() && index.vecs.size > 0) {
      try {
        const [qv] = await embed([[question, ...plan.keywords].join('. ')], 'query');
        dense.meaning = denseRank(index.vecs, qv, 'txt', allowed, 40).filter((h) => h.score > 0.12);
        dense.visual = denseRank(index.vecs, qv, 'img', allowed, 40).filter((h) => h.score > 0.12);
        meaningHits = dense.meaning.length;
        visualHits = dense.visual.length;
      } catch (e) {
        notes.push(`Semantic search unavailable: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`);
      }
    } else if (!isNvidiaConfigured()) notes.push('No embedding key configured; keyword search only.');
    else notes.push('Semantic index is empty; keyword search only. Build it from the Library.');

    // 4. Fuse
    ranked = rrf({
      keywords: lex,
      ...(dense.meaning ? { meaning: dense.meaning } : {}),
      ...(dense.visual ? { visual: dense.visual } : {}),
    }).slice(0, 24);

    // 5. Nothing matched at all: fall back to the most severe items in scope so the answer is never empty-handed
    if (!ranked.length) {
      ranked = [...pool]
        .sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1))
        .slice(0, 12)
        .map((p, i) => ({ id: p.id, rrf: 1 / (60 + i), ranks: { fallback: i + 1 } }));
      if (ranked.length) notes.push('No direct match; showing the most severe items in scope.');
    }
  }

  const evidence: EvidenceCard[] = ranked
    .slice(0, 12)
    .map((r, i) => {
      const a = byId.get(r.id);
      if (!a) return null;
      const card: EvidenceCard = {
        n: i + 1,
        id: a.id,
        title: a.title ?? a.original_filename,
        caption: (caps.get(a.id)?.caption ?? a.description ?? '').slice(0, 260),
        thumb: derive(a.cloudinary_url, 'card'),
        severity: a.severity,
        site: a.zone_id ? zoneName.get(a.zone_id) ?? null : null,
        phase: a.phase,
        date: a.captured_at,
        tags: (a.tags ?? []).filter((t) => !['chennai', 'commons'].includes(t)).slice(0, 8),
        credit: a.attribution,
        license: a.license,
        sourceUrl: a.source_url,
        event: a.event_label,
        matched: { keywords: r.ranks.keywords, meaning: r.ranks.meaning, visual: r.ranks.visual },
        score: Number(r.rrf.toFixed(4)),
      };
      return card;
    })
    .filter((e): e is EvidenceCard => e !== null);

  let reports: Retrieved['reports'] = [];
  if (plan.needsReports || plan.intent === 'mixed') {
    const { data } = await db
      .from('reports')
      .select('title, risk_level, created_at, content_markdown')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(4);
    reports = ((data ?? []) as { title: string; risk_level: string; created_at: string; content_markdown: string }[]).map((r) => ({
      title: r.title,
      risk: r.risk_level,
      date: formatDate(r.created_at),
      excerpt: (r.content_markdown.split('## Executive summary')[1] ?? '').split('##')[0].replace(/\s+/g, ' ').trim().slice(0, 320),
    }));
  }

  const weather: Retrieved['weather'] = [];
  if (plan.needsWeather || plan.intent === 'weather') {
    const targets = plan.zoneId ? zones.filter((z) => z.id === plan.zoneId) : zones.slice(0, 7);
    const results = await Promise.allSettled(targets.map((z) => fetchWeather(z.lat, z.lng)));
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const z = targets[i];
      const sev = stats.map.find((m) => m.zoneId === z.id);
      const maxSev = sev ? Math.round(Math.max(0, ...sev.leaves.map((l) => l.avgSeverity ?? 0))) : 0;
      const risk = computeRisk(r.value, { maxSeverity: maxSev, drainIssues: 0, count: sev?.total ?? 0 });
      weather.push({ site: z.name, rain24Mm: r.value.next24hMm, imd: imdClass(r.value.next24hMm).label, peakProb: r.value.peakProb, risk: risk.level, score: risk.score });
    });
  }

  return {
    evidence,
    stats,
    reports,
    weather,
    trace: {
      method: fixedIds.length ? 'Your selection' : meaningHits !== null ? 'Hybrid: BM25 + text meaning + image content, fused by RRF' : 'Keywords only (BM25)',
      candidates: pool.length,
      keywordHits,
      meaningHits,
      visualHits,
      fused: evidence.length,
      indexed: Math.max(index.vecs.size, indexedCount(organizationId)),
      indexTotal: stats.total,
      persisted: index.persistedColumns,
      notes,
    },
  };
}

export interface Answer {
  markdown: string;
  followups: string[];
  cited: number[];
  by: 'llm' | 'rules';
  model?: string;
  grounding: Grounding;
}

function compactStats(s: Collections) {
  return {
    total_items: s.total,
    analysed: s.analysed,
    sites: s.sites.slice(0, 8).map((x) => `${x.label}: ${x.count}`),
    phases: s.phases.map((x) => `${x.label}: ${x.count}`),
    severity: s.severity.map((x) => `${x.label}: ${x.count}`),
    events: s.events.map((x) => `${x.label}: ${x.count}`),
    date_range: s.dateRange,
  };
}

export async function writeAnswer(question: string, plan: Plan, r: Retrieved): Promise<Answer> {
  const context = {
    archive: compactStats(r.stats),
    evidence: r.evidence.slice(0, 18).map((e) => ({
      ref: e.n,
      title: e.title,
      caption: e.caption,
      site: e.site ?? 'city-wide',
      phase: e.phase.toLowerCase(),
      severity: e.severity,
      date: e.date ? formatDate(e.date) : null,
      event: e.event,
      tags: e.tags.slice(0, 5),
    })),
    recent_reports: r.reports,
    live_weather: r.weather,
  };

  const llm = await completeText({
    system:
      'You are Atlas, an analyst for an evidence archive of field photos. Answer using ONLY the CONTEXT JSON. ' +
      'Cite evidence with bracketed numbers like [2] that match "ref" in the context (write [2], never n2). If the context does not contain the answer, say what is missing and suggest a better question. ' +
      'If no item clearly shows what was asked, say so plainly and describe the closest items instead of stretching them. Never invent numbers, places or dates. Keep it under 170 words: a direct answer first, then up to 4 short bullets. Plain English. No headings, no tables.',
    user:
      `QUESTION: ${question}\n\nCONTEXT:\n${JSON.stringify(context)}\n\n` +
      'After the answer, add a final line starting with FOLLOWUPS: then three short follow-up questions separated by " | ".',
    maxTokens: 700,
    temperature: 0.2,
  });

  if (llm) {
    const [body, fu] = llm.text.split(/\n\s*FOLLOWUPS:\s*/i);
    // models sometimes write "ref 3" or "n3" instead of [3]; normalise so citations always link
    const md = sanitizeLlmMarkdown(body, 1600)
      // "Refs 1, 2 and 3" -> [1] [2] [3]
      .replace(/\brefs?\.?\s*((?:\d{1,2}\s*(?:,|and|&)?\s*)+)/gi, (_m, list: string) => (list.match(/\d{1,2}/g) ?? []).map((n) => `[${n}]`).join(' ') + ' ')
      // "n3" -> [3]
      .replace(/\bn(\d{1,2})\b/g, '[$1]');
    if (md.length > 30) {
      const valid = new Set(r.evidence.map((e) => e.n));
      const cited = Array.from(new Set(Array.from(md.matchAll(/\[(\d{1,2})\]/g)).map((m) => Number(m[1])))).filter((n) => valid.has(n));
      const followups = (fu ?? '').split('|').map((s) => s.replace(/^[\s\-\d.]+/, '').trim()).filter((s) => s.length > 8 && s.length < 110).slice(0, 3);
      return { markdown: md, followups, cited, by: 'llm', model: llm.model, grounding: verifyAnswer(md, context, valid) };
    }
  }

  // Rule-based answer
  const top = r.evidence.slice(0, 5);
  const lines: string[] = [];
  if (top.length) {
    lines.push(`I found **${r.evidence.length}** matching item${r.evidence.length === 1 ? '' : 's'}${plan.zoneName ? ` for ${plan.zoneName}` : ''}. The strongest:`);
    top.forEach((e) => lines.push(`- [${e.n}] ${e.title}${e.severity !== null ? ` (severity ${e.severity} of 3)` : ''}${e.caption ? `: ${e.caption}` : ''}`));
  } else {
    lines.push(`I could not find evidence matching that. The archive holds **${r.stats.total}** items across ${r.stats.sites.length} site groups. Try naming a place or what is visible, for example "flooded road" or "boat".`);
  }
  if (r.weather.length) lines.push('', ...r.weather.map((w) => `- ${w.site}: ${w.rain24Mm} mm expected (${w.imd.toLowerCase()}), risk ${w.risk.toLowerCase()} (${w.score}/100)`));
  return {
    markdown: lines.join('\n'),
    followups: ['Show the most severe flooding', 'What did normal conditions look like?', 'Which site has the most evidence?'],
    cited: top.map((e) => e.n),
    by: 'rules',
    grounding: verifyAnswer(lines.join('\n'), context, new Set(r.evidence.map((e) => e.n))),
  };
}

export interface ClaimCheck {
  claim: string;
  refs: number[];
  supported: boolean | null;
}

/**
 * Entailment check, in the spirit of RAGAS faithfulness / LLM-as-judge: for each cited claim, does the cited item's
 * own description support it? Runs after the answer is shown, so it never slows the answer down.
 */
export async function judgeClaims(markdown: string, evidence: EvidenceCard[]): Promise<ClaimCheck[] | null> {
  const claims = markdown
    .split(/\n+/)
    .map((l) => l.replace(/^[-*\s]+/, '').trim())
    .filter((l) => /\[\d{1,2}\]/.test(l))
    .slice(0, 6)
    .map((l) => ({ claim: l.replace(/\[\d{1,2}\]/g, '').replace(/\s+/g, ' ').replace(/^[:;,.\s\u2013\u2014-]+/, '').trim(), refs: Array.from(new Set(Array.from(l.matchAll(/\[(\d{1,2})\]/g)).map((m) => Number(m[1])))) }))
    .filter((c) => c.claim.length > 12);
  if (!claims.length) return null;

  const items = claims.map((c, i) => ({
    i,
    claim: c.claim,
    evidence: c.refs.map((r) => evidence.find((e) => e.n === r)).filter(Boolean).map((e) => `${e!.title}. ${e!.caption} Tags: ${e!.tags.join(', ')}`),
  }));
  const llm = await completeText({
    system: 'You are a strict fact-checker. For each item, decide if the EVIDENCE text supports the CLAIM. Reply ONLY with a JSON array of booleans, one per item, in order.',
    user: JSON.stringify(items),
    maxTokens: 120,
    temperature: 0,
  });
  if (!llm) return null;
  try {
    const arr = JSON.parse(llm.text.match(/\[[\s\S]*\]/)![0]) as unknown[];
    return claims.map((c, i) => ({ ...c, supported: typeof arr[i] === 'boolean' ? (arr[i] as boolean) : null }));
  } catch {
    return null;
  }
}
