import type { Db } from '@/lib/auth';
import type { AiAnalysis, MediaAsset, Report, Zone } from '@/lib/domain';
import { completeText, sanitizeLlmMarkdown } from '@/lib/ai/llm';
import { derive, TRANSFORMS } from '@/lib/cloudinary/urls';
import { createComparison } from '@/lib/pipeline/compare';
import { formatDate, SEVERITY_LABELS } from '@/lib/utils';
import { ASSET_COLS } from '@/lib/columns';

export interface EvidenceScope {
  ids?: string[];
  zone?: string | null;
  phase?: string | null;
  minSeverity?: number | null;
  event?: string | null;
  q?: string | null;
}

const cell = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

interface Item {
  ref: number;
  asset: MediaAsset;
  analysis: AiAnalysis | null;
  site: string;
}

async function resolveScope(db: Db, org: string, scope: EvidenceScope) {
  let q = db.from('media_assets').select(ASSET_COLS).eq('organization_id', org).eq('resource_type', 'image').neq('status', 'ARCHIVED');
  if (scope.ids?.length) q = q.in('id', scope.ids.slice(0, 40));
  else {
    if (scope.zone === 'none') q = q.is('zone_id', null);
    else if (scope.zone) q = q.eq('zone_id', scope.zone);
    if (scope.phase) q = q.eq('phase', scope.phase);
    if (scope.minSeverity != null) q = q.gte('severity', scope.minSeverity);
    if (scope.event) q = q.eq('event_label', scope.event);
    if (scope.q?.trim()) q = q.textSearch('search_vector', scope.q.trim(), { type: 'websearch', config: 'english' });
  }
  const { data } = await q.order('severity', { ascending: false, nullsFirst: false }).limit(40);
  return (data ?? []) as MediaAsset[];
}

function describeScope(scope: EvidenceScope, zones: Zone[]): string {
  if (scope.ids?.length) return `${plural(scope.ids.length, 'hand-picked item')}`;
  const bits = [
    scope.zone === 'none' ? 'city-wide items' : scope.zone ? zones.find((z) => z.id === scope.zone)?.name : null,
    scope.phase ? `${scope.phase.toLowerCase()} phase` : null,
    scope.minSeverity != null ? `severity ${scope.minSeverity}+` : null,
    scope.event,
    scope.q ? `matching "${scope.q}"` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(', ') : 'the whole archive';
}

export async function buildEvidenceReport(args: {
  db: Db;
  organizationId: string;
  userId: string;
  scope: EvidenceScope;
  title?: string | null;
}): Promise<Report> {
  const { db, organizationId, userId, scope } = args;
  const [assets, { data: zoneRows }] = await Promise.all([resolveScope(db, organizationId, scope), db.from('zones').select('*').eq('organization_id', organizationId)]);
  if (!assets.length) throw new Error('No evidence matches that selection. Widen the filters or pick different items.');
  const zones = (zoneRows ?? []) as Zone[];
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  const ids = assets.map((a) => a.id);
  const { data: an } = await db.from('ai_analyses').select('*').in('media_asset_id', ids).order('created_at', { ascending: false });
  const latest = new Map<string, AiAnalysis>();
  for (const a of (an ?? []) as AiAnalysis[]) if (!latest.has(a.media_asset_id)) latest.set(a.media_asset_id, a);

  const shown: Item[] = assets.slice(0, 12).map((asset, i) => ({ ref: i + 1, asset, analysis: latest.get(asset.id) ?? null, site: asset.zone_id ? zoneName.get(asset.zone_id) ?? 'Unknown site' : 'City-wide' }));

  // Facts computed from the data itself
  const count = (f: (a: MediaAsset) => string) => {
    const m = new Map<string, number>();
    for (const a of assets) m.set(f(a), (m.get(f(a)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const bySite = count((a) => (a.zone_id ? zoneName.get(a.zone_id) ?? 'Unknown site' : 'City-wide'));
  const byPhase = count((a) => a.phase.charAt(0) + a.phase.slice(1).toLowerCase());
  const sev = [3, 2, 1, 0].map((l) => [SEVERITY_LABELS[l], assets.filter((a) => (a.severity ?? -1) === l).length] as const);
  const dates = assets.map((a) => a.captured_at).filter((d): d is string => Boolean(d)).sort();
  const analysed = assets.filter((a) => a.status === 'ANALYZED').length;
  const sources = new Set(assets.map((a) => a.source_name ?? 'Field upload'));
  const events = count((a) => a.event_label ?? '').filter(([k]) => k);

  // Before/after only when two items from the SAME site differ in phase or severity
  let comparison: { before: MediaAsset; after: MediaAsset; summary: string } | null = null;
  const bySiteMap = new Map<string, MediaAsset[]>();
  for (const a of assets) if (a.zone_id && a.severity != null) bySiteMap.set(a.zone_id, [...(bySiteMap.get(a.zone_id) ?? []), a]);
  let best: [MediaAsset, MediaAsset] | null = null;
  let bestGap = 0;
  for (const list of bySiteMap.values()) {
    const lo = [...list].sort((x, y) => (x.severity ?? 0) - (y.severity ?? 0))[0];
    const hi = [...list].sort((x, y) => (y.severity ?? 0) - (x.severity ?? 0))[0];
    const gap = (hi.severity ?? 0) - (lo.severity ?? 0);
    if (lo.id !== hi.id && gap > bestGap) {
      best = [lo, hi];
      bestGap = gap;
    }
  }
  if (best) {
    const cmp = await createComparison(db, { organizationId, userId, before: best[0], after: best[1], zoneId: best[0].zone_id, sameSite: true });
    comparison = { before: best[0], after: best[1], summary: cmp.summary ?? '' };
  }

  // Narrative: LLM writes summary + findings from the facts only; fall back to rules
  const facts = {
    scope: describeScope(scope, zones),
    items: assets.length,
    analysed,
    sites: bySite.map(([k, v]) => `${k}: ${v}`),
    phases: byPhase.map(([k, v]) => `${k}: ${v}`),
    severity: sev.map(([k, v]) => `${k}: ${v}`),
    date_range: dates.length ? `${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])}` : 'dates not recorded',
    events: events.map(([k, v]) => `${k}: ${v}`),
    examples: shown.slice(0, 8).map((s) => ({ ref: s.ref, title: s.asset.title, caption: s.analysis?.description ?? s.asset.description, site: s.site, severity: s.asset.severity })),
  };
  let summary = `This report covers ${describeScope(scope, zones)}: ${plural(assets.length, 'photo')}${bySite[0] ? `, mostly from ${bySite[0][0]}` : ''}${dates.length ? `, captured between ${formatDate(dates[0])} and ${formatDate(dates[dates.length - 1])}` : ''}. ${sev[0][1] ? `${plural(sev[0][1], 'photo')} ${sev[0][1] === 1 ? 'shows' : 'show'} severe flooding.` : 'None show severe flooding.'}`;
  let findings = [
    `${analysed} of ${assets.length} items have been read by AI; the rest are pending analysis.`,
    bySite[0] ? `Most evidence comes from ${bySite[0][0]} (${bySite[0][1]}).` : '',
    sev[0][1] ? `${plural(sev[0][1], 'item')} rated severe (level 3 of 3).` : '',
  ].filter(Boolean);
  let provider = 'rules';
  const llm = await completeText({
    system: 'You write concise evidence summaries for analysts. Use ONLY the JSON facts. Never invent numbers, places or dates. Plain English, no headings, no code.',
    user: `Facts:\n${JSON.stringify(facts)}\n\nOutput exactly two parts separated by a line containing ---FINDINGS---.\nPart 1: a 3 to 4 sentence summary.\nPart 2: 4 to 6 lines starting with "- " with the most useful findings; cite examples as [ref] using the "ref" numbers when relevant.`,
    maxTokens: 700,
  });
  if (llm) {
    const [s1, s2] = llm.text.split(/-{3}\s*FINDINGS\s*-{3}/i);
    const sm = sanitizeLlmMarkdown(s1 ?? '', 800);
    const fs = (s2 ?? '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+\S/.test(l)).map((l) => l.replace(/^[-*]\s+/, '').replace(/<[^>]+>/g, '').slice(0, 240));
    if (sm.length > 50 && fs.length >= 3) {
      summary = sm;
      findings = fs.slice(0, 6);
      provider = llm.provider;
    }
  }
  // Refs in findings point at the numbered figures below
  const validRefs = new Set(shown.map((s) => s.ref));
  findings = findings.map((f) => f.replace(/\[(\d{1,2})\]/g, (m, n) => (validRefs.has(Number(n)) ? `(Figure ${n})` : '')));

  const generatedAt = new Date();
  const title = args.title?.trim() || `Evidence report: ${describeScope(scope, zones)}`;

  const L: string[] = [];
  L.push(`# ${title}`, '');
  L.push(`_Prepared ${formatDate(generatedAt, true)} IST from ${plural(assets.length, 'evidence item')}. Media stored and delivered by Cloudinary; captions and tags by AI, checked by rules._`, '');
  L.push('```metrics');
  L.push(
    JSON.stringify([
      { label: 'Evidence items', value: String(assets.length), note: `${analysed} analysed` },
      { label: 'Sites', value: String(bySite.length), note: bySite[0] ? `Most: ${bySite[0][0]}` : '' },
      { label: 'Severe (level 3)', value: String(sev[0][1]), note: 'Of items analysed' },
      { label: 'Date range', value: dates.length ? formatDate(dates[0]).replace(/ \d{4}$/, '') : 'n/a', note: dates.length ? `to ${formatDate(dates[dates.length - 1])}` : 'No capture dates' },
      { label: 'Sources', value: String(sources.size), note: [...sources].slice(0, 2).join(', ') },
    ])
  );
  L.push('```', '');
  L.push('## Summary', '', summary, '');
  L.push('## Key findings', '', ...findings.map((f) => `- ${f}`), '');
  L.push('## How the evidence is spread', '');
  L.push('| Severity | Items |', '| --- | ---: |', ...sev.map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('| Phase | Items |', '| --- | ---: |', ...byPhase.map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('| Site | Items |', '| --- | ---: |', ...bySite.slice(0, 8).map(([k, v]) => `| ${cell(k)} | ${v} |`), '');
  L.push('## Evidence', '');
  for (const s of shown) {
    const a = s.asset;
    L.push(`### Figure ${s.ref}. ${cell(a.title) || 'Untitled'}`, '');
    L.push(`![${cell(s.analysis?.description || a.title)}](asset://${a.id} "Severity ${a.severity ?? '?'} of 3 | ${s.site}${a.captured_at ? ' | ' + formatDate(a.captured_at) : ''}")`, '');
    L.push([`**${SEVERITY_LABELS[a.severity ?? 0]}**`, s.site, a.phase.charAt(0) + a.phase.slice(1).toLowerCase(), a.tags.length ? a.tags.slice(0, 5).map((t) => '`' + t + '`').join(' ') : ''].filter(Boolean).join(' · '));
    if (s.analysis?.description) L.push('', cell(s.analysis.description));
    L.push('', `_Photo: ${cell(a.attribution) || 'Unknown'}${a.license ? ', ' + cell(a.license) : ''}${a.source_url ? ` · [source](${a.source_url})` : ''}_`, '');
  }
  if (assets.length > shown.length) L.push(`_${assets.length - shown.length} more items are in scope but not shown. Narrow the selection for a fuller figure list._`, '');
  if (comparison) {
    L.push('## Before and after', '', '```compare', JSON.stringify({ before: comparison.before.id, after: comparison.after.id, beforeLabel: cell(comparison.before.title), afterLabel: cell(comparison.after.title) }), '```', '', comparison.summary, '');
  }
  L.push('## Traceability', '', 'Each image is a Cloudinary URL derived from an unmodified original. The transformation below reproduces it exactly.', '');
  L.push('| Figure | Cloudinary public ID | Version | Transformation | Source and licence |', '| ---: | --- | ---: | --- | --- |');
  for (const s of shown) L.push(`| ${s.ref} | \`${s.asset.cloudinary_public_id.split('/').pop()}\` | ${s.asset.version ?? ''} | \`${TRANSFORMS.report}\` | ${cell(s.asset.source_name) || 'Field upload'}, ${cell(s.asset.license) || 'internal'} |`);
  L.push('');
  if (shown.some((s) => s.analysis?.provider === 'metadata-heuristic')) {
    L.push('> [!NOTE]', '> Some items were labelled from their source description because image AI was unavailable. Treat those severity ratings as provisional.', '');
  }

  const { data: report, error } = await db
    .from('reports')
    .insert({
      organization_id: organizationId,
      zone_id: scope.zone && scope.zone !== 'none' ? scope.zone : null,
      title,
      content_markdown: L.join('\n'),
      risk_level: 'LOW',
      risk_score: 0,
      weather: { kind: 'evidence', items: assets.length },
      evidence: shown.map((s) => ({ asset_id: s.asset.id, severity: s.asset.severity })),
      llm_provider: provider,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error || !report) throw new Error(`Could not save report: ${error?.message}`);

  const prov = [...shown.map((s) => s.asset), ...(comparison ? [comparison.before, comparison.after] : [])].map((a) => ({
    organization_id: organizationId,
    media_asset_id: a.id,
    purpose: 'report',
    transformation: TRANSFORMS.report,
    derived_url: derive(a.cloudinary_url, 'report'),
    source_version: a.version,
    source_etag: a.etag,
    used_in_type: 'report',
    used_in_id: (report as Report).id,
  }));
  if (prov.length) await db.from('asset_provenance').insert(prov);
  return report as Report;
}
