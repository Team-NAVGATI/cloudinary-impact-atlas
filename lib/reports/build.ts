import type { Db } from '@/lib/auth';
import type { AiAnalysis, MediaAsset, Report, Zone } from '@/lib/domain';
import { completeText, sanitizeLlmMarkdown } from '@/lib/ai/llm';
import { derive, TRANSFORMS } from '@/lib/cloudinary/urls';
import { createComparison } from '@/lib/pipeline/compare';
import { computeRisk, type RiskResult } from '@/lib/risk';
import { fetchWeather, imdClass, simulateScenario, type WeatherSnapshot } from '@/lib/weather/openmeteo';
import { formatDate, SEVERITY_LABELS } from '@/lib/utils';
import { ASSET_COLS } from '@/lib/columns';

export interface ScenarioInput {
  rain24Mm: number;
  label: string;
}

interface EvidenceItem {
  asset: MediaAsset;
  analysis: AiAnalysis | null;
}

const cell = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

/** Rule-based actions, always available. Ordered by urgency. */
function deterministicActions(zone: Zone, risk: RiskResult, evidence: EvidenceItem[], w: WeatherSnapshot): string[] {
  const places = evidence
    .filter((e) => (e.asset.severity ?? 0) >= 2)
    .map((e) => e.asset.title)
    .filter(Boolean)
    .slice(0, 2) as string[];
  const drainFlag = evidence.some((e) => e.analysis?.environmental_signals?.blocked_drain || e.analysis?.environmental_signals?.garbage);
  const list: string[] = [];

  if (risk.level === 'SEVERE') {
    list.push(`Activate the zone control room now and pre-position dewatering pumps around ${zone.name}.`);
    list.push('Issue a public warning through loudspeakers, SMS and social channels for low-lying streets.');
    list.push('Open designated relief centres and confirm boats and rescue teams are staged.');
  } else if (risk.level === 'HIGH') {
    list.push(`Pre-position dewatering pumps and crews at documented waterlogging points in ${zone.name}.`);
    list.push('Send a heavy-rain advisory to residents of low-lying streets and ask them to move vehicles.');
  } else if (risk.level === 'MODERATE') {
    list.push(`Keep crews on standby for ${zone.name} and re-check the forecast every 6 hours.`);
  } else {
    list.push(`No emergency action needed; continue routine monitoring of ${zone.name}.`);
  }
  if (places.length) list.push(`Inspect the documented problem spots first: ${places.join('; ')}.`);
  if (drainFlag) list.push('Clear the drains and culverts flagged in the evidence before rain arrives.');
  if (w.river?.ratio && w.river.ratio >= 1.5) list.push('Coordinate with the Water Resources Department on reservoir and river release schedules.');
  list.push('Have field teams upload fresh photos after the rain so the before/after record stays current.');
  return list;
}

function deterministicSummary(zone: Zone, risk: RiskResult, w: WeatherSnapshot, ev: EvidenceItem[]): string {
  const cls = imdClass(w.next24hMm);
  const sev3 = ev.filter((e) => (e.asset.severity ?? 0) >= 3).length;
  const scenario = w.simulated ? ` This is a simulated scenario (${w.scenarioLabel}), not a live forecast.` : '';
  return (
    `${zone.name} is at **${risk.level.toLowerCase()} flood risk** (score ${risk.score}/100). ` +
    `${w.next24hMm} mm of rain is expected in the next 24 hours (${cls.label.toLowerCase()} by IMD classes), ` +
    `with up to ${w.peakProb}% chance of rain over 72 hours. ` +
    (ev.length
      ? `${ev.length} evidence item${ev.length === 1 ? '' : 's'} from this area ${ev.length === 1 ? 'is' : 'are'} attached${sev3 ? `, ${sev3} showing severe flooding` : ''}.`
      : 'No analysed evidence exists for this area yet.') +
    scenario
  );
}

async function narrative(
  zone: Zone,
  risk: RiskResult,
  w: WeatherSnapshot,
  ev: EvidenceItem[]
): Promise<{ summary: string; actions: string[]; provider: string }> {
  const fallbackSummary = deterministicSummary(zone, risk, w, ev);
  const fallbackActions = deterministicActions(zone, risk, ev, w);

  const facts = {
    zone: zone.name,
    zone_kind: zone.kind,
    risk: { level: risk.level, score: risk.score, drivers: risk.drivers.map((d) => `${d.label}: ${d.detail}`) },
    forecast: {
      rain_next_24h_mm: w.next24hMm,
      rain_next_72h_mm: w.next72hMm,
      peak_probability_pct: w.peakProb,
      rain_last_48h_mm: w.past48hMm,
      simulated: w.simulated,
    },
    evidence: ev.map((e) => ({
      title: e.asset.title,
      severity: e.asset.severity,
      caption: e.analysis?.description ?? e.asset.description,
      event: e.asset.event_label,
    })),
  };

  const llm = await completeText({
    system:
      'You write flood situation reports for municipal officers in India. Be concrete, calm and factual. ' +
      'Use ONLY numbers and places present in the JSON facts. Never invent figures. No headings, no code, no HTML.',
    user:
      `Facts:\n${JSON.stringify(facts)}\n\n` +
      'Output exactly two parts separated by a single line containing ---ACTIONS---.\n' +
      'Part 1: a 3 to 4 sentence executive summary in plain English (bold the risk level with **).\n' +
      'Part 2: 5 to 7 task-list lines, each starting with "- [ ] ", ordered by urgency, each under 25 words and tied to a fact above.',
    maxTokens: 800,
  });

  if (!llm) console.warn('[report] no LLM text available; using rule-based narrative');
  if (llm) {
    const [rawSummary, rawActions] = llm.text.split(/-{3}\s*ACTIONS\s*-{3}/i);
    const summary = sanitizeLlmMarkdown(rawSummary ?? '', 900);
    const actions = (rawActions ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s*\[ \]\s+\S/.test(l))
      .map((l) => l.replace(/^[-*]\s*\[ \]\s+/, '').replace(/<[^>]+>/g, '').slice(0, 220));
    if (summary.length > 60 && actions.length >= 3) {
      return { summary, actions: actions.slice(0, 8), provider: llm.provider };
    }
    console.warn('[report] LLM output failed validation', { summaryLen: summary.length, actions: actions.length, head: llm.text.slice(0, 120) });
  }
  return { summary: fallbackSummary, actions: fallbackActions, provider: 'rules' };
}

export function composeMarkdown(args: {
  zone: Zone;
  generatedAt: Date;
  risk: RiskResult;
  weather: WeatherSnapshot;
  evidence: EvidenceItem[];
  comparison: { beforeId: string; afterId: string; summary: string; before: MediaAsset; after: MediaAsset; sameSite: boolean } | null;
  summary: string;
  actions: string[];
  heuristicUsed: boolean;
}): string {
  const { zone, risk, weather: w, evidence, comparison } = args;
  const cls = imdClass(w.next24hMm);
  const lines: string[] = [];

  lines.push(`# Flood-Watch situation report: ${zone.name}`);
  lines.push('');
  lines.push(
    `_Prepared ${formatDate(args.generatedAt, true)} IST for the ${zone.name} response team. ` +
      `Forecast valid for 72 hours. Sources: ${w.sources.join(', ')}; field media stored and delivered by Cloudinary._`
  );
  lines.push('');
  lines.push('```risk');
  lines.push(JSON.stringify({ level: risk.level, score: risk.score, drivers: risk.drivers, simulated: w.simulated }));
  lines.push('```');
  lines.push('');

  if (w.simulated) {
    lines.push('> [!NOTE]');
    lines.push(`> **Scenario simulation, not a forecast.** Rainfall was set to ${w.next24hMm} mm/24 h to model "${w.scenarioLabel}". Use it to rehearse response, not to trigger real evacuations.`);
    lines.push('');
  } else if (risk.level === 'SEVERE' || risk.level === 'HIGH') {
    lines.push('> [!WARNING]');
    lines.push(`> **Action window: the next 24 hours.** ${w.next24hMm} mm of rain is forecast (${cls.label.toLowerCase()}). Crews and pumps should be in position before the peak.`);
    lines.push('');
  } else {
    lines.push('> [!TIP]');
    lines.push(`> No immediate emergency indicated. Rain over the next 24 hours is ${cls.label.toLowerCase()} (${w.next24hMm} mm).`);
    lines.push('');
  }

  lines.push('## Executive summary');
  lines.push('');
  lines.push(args.summary);
  lines.push('');

  lines.push('## At a glance');
  lines.push('');
  lines.push('```metrics');
  lines.push(
    JSON.stringify([
      { label: 'Rain, next 24 h', value: `${w.next24hMm} mm`, note: `IMD: ${cls.label}` },
      { label: 'Rain, next 72 h', value: `${w.next72hMm} mm`, note: `Peak chance ${w.peakProb}%` },
      { label: 'Rain, last 48 h', value: `${w.past48hMm} mm`, note: w.past48hMm >= 20 ? 'Ground is wet' : 'Ground is drying' },
      {
        label: 'River flow',
        value: w.river?.ratio != null ? `${w.river.ratio}× mean` : 'n/a',
        note: w.river?.peak3d != null ? `Peak ${w.river.peak3d.toFixed(1)} m³/s` : 'No gauge model here',
      },
      { label: 'Evidence items', value: String(evidence.length), note: 'Analysed and attached' },
    ])
  );
  lines.push('```');
  lines.push('');

  lines.push('## Weather outlook');
  lines.push('');
  lines.push('| Day | Rain (mm) | Peak chance of rain |');
  lines.push('| --- | ---: | ---: |');
  for (const d of w.daily) {
    lines.push(`| ${formatDate(d.date)} | ${d.precipSum.toFixed(1)} | ${d.probMax != null ? d.probMax + '%' : 'n/a'} |`);
  }
  lines.push('');

  lines.push('## Ground evidence');
  lines.push('');
  if (!evidence.length) {
    lines.push('_No analysed evidence is available for this zone yet. Upload photos and run analysis to strengthen this report._');
    lines.push('');
  }
  evidence.forEach((e, i) => {
    const a = e.asset;
    const sev = a.severity ?? 0;
    lines.push(`### ${i + 1}. ${cell(a.title) || 'Untitled evidence'}`);
    lines.push('');
    lines.push(
      `![${cell(e.analysis?.description || a.title)}](asset://${a.id} "Severity ${sev} of 3: ${SEVERITY_LABELS[sev]}${a.captured_at ? ' | ' + formatDate(a.captured_at) : ''}")`
    );
    lines.push('');
    const meta = [
      `**Severity ${sev}/3** (${SEVERITY_LABELS[sev].toLowerCase()})`,
      a.event_label ? `Event: ${cell(a.event_label)}` : null,
      a.zone_id ? null : 'Location: Chennai (exact spot not recorded)',
      a.tags.length ? `Tags: ${a.tags.slice(0, 6).map((t) => '`' + t + '`').join(' ')}` : null,
    ].filter(Boolean);
    lines.push(meta.join(' · '));
    if (e.analysis?.description) {
      lines.push('');
      lines.push(cell(e.analysis.description));
    }
    lines.push('');
    lines.push(
      `_Photo: ${cell(a.attribution) || 'Unknown'}${a.license ? ', ' + cell(a.license) : ''}${a.source_url ? ` · [source](${a.source_url})` : ''}_`
    );
    lines.push('');
  });

  if (comparison) {
    lines.push('## Before and after');
    lines.push('');
    if (!comparison.sameSite) {
      lines.push('> [!NOTE]');
      lines.push('> **Reference pair, not a change over time.** No normal-day photo exists yet for the exact spot shown flooded, so the earlier image is from another Chennai location. Upload one to turn this into a true before and after.');
      lines.push('');
    }
    lines.push('```compare');
    lines.push(
      JSON.stringify({
        before: comparison.beforeId,
        after: comparison.afterId,
        beforeLabel: cell(comparison.before.title),
        afterLabel: cell(comparison.after.title),
      })
    );
    lines.push('```');
    lines.push('');
    lines.push(comparison.summary);
    lines.push('');
  }

  lines.push('## Recommended actions');
  lines.push('');
  args.actions.forEach((a) => lines.push(`- [ ] ${a}`));
  lines.push('');

  lines.push('## Traceability');
  lines.push('');
  lines.push('Every image above is a Cloudinary delivery URL derived from an original that is stored unchanged. The exact transformation is listed so anyone can reproduce or audit it.');
  lines.push('');
  lines.push('| Ref | Cloudinary public ID | Version | Transformation | Source and licence |');
  lines.push('| ---: | --- | ---: | --- | --- |');
  evidence.forEach((e, i) => {
    const a = e.asset;
    lines.push(
      `| ${i + 1} | \`${a.cloudinary_public_id.split('/').pop()}\` | ${a.version ?? ''} | \`${TRANSFORMS.report}\` | ${cell(a.source_name) || 'Field upload'}, ${cell(a.license) || 'internal'} |`
    );
  });
  lines.push('');
  if (args.heuristicUsed) {
    lines.push('> [!NOTE]');
    lines.push('> Some evidence was labelled from its source description because the image-vision service was unavailable. Treat those severity ratings as provisional until a reviewer confirms them.');
    lines.push('');
  }
  lines.push(`_Report generated by Impact Atlas. Risk score method: ${risk.drivers.map((d) => d.label.toLowerCase()).join(', ')}._`);
  return lines.join('\n');
}

async function loadEvidence(db: Db, organizationId: string, zone: Zone) {
  // Zone-specific evidence plus city-wide evidence whose exact location was not recorded.
  const { data: assets } = await db
    .from('media_assets')
    .select(ASSET_COLS)
    .eq('organization_id', organizationId)
    .eq('status', 'ANALYZED')
    .or(`zone_id.eq.${zone.id},zone_id.is.null`)
    .order('severity', { ascending: false, nullsFirst: false })
    .order('captured_at', { ascending: false, nullsFirst: false })
    .limit(60);
  const all = (assets ?? []) as MediaAsset[];
  const ids = all.map((a) => a.id);
  const { data: analyses } = ids.length
    ? await db.from('ai_analyses').select('*').in('media_asset_id', ids).order('created_at', { ascending: false })
    : { data: [] as AiAnalysis[] };
  const latest = new Map<string, AiAnalysis>();
  for (const an of (analyses ?? []) as AiAnalysis[]) if (!latest.has(an.media_asset_id)) latest.set(an.media_asset_id, an);

  const items: EvidenceItem[] = all.map((asset) => ({ asset, analysis: latest.get(asset.id) ?? null }));
  return { items };
}

export async function buildReport(args: {
  db: Db;
  organizationId: string;
  userId: string;
  zone: Zone;
  scenario?: ScenarioInput | null;
}): Promise<Report> {
  const { db, organizationId, userId, zone } = args;

  let weather = await fetchWeather(zone.lat, zone.lng);
  if (args.scenario) weather = simulateScenario(weather, args.scenario.rain24Mm, args.scenario.label);

  const { items } = await loadEvidence(db, organizationId, zone);
  const zoneMax = items.filter((e) => e.asset.zone_id === zone.id).reduce((m, e) => Math.max(m, e.asset.severity ?? 0), 0);
  const cityMax = items.filter((e) => !e.asset.zone_id).reduce((m, e) => Math.max(m, e.asset.severity ?? 0), 0);
  // City-wide photos count toward exposure, but capped: they do not prove this specific zone flooded.
  const maxSeverity = Math.max(zoneMax, Math.min(cityMax, 2));
  const drainIssues = items.filter(
    (e) => e.analysis?.environmental_signals?.blocked_drain || e.analysis?.environmental_signals?.garbage
  ).length;
  const risk = computeRisk(weather, { maxSeverity, drainIssues, count: items.length });

  // Evidence shown in the report: worst DURING items first, at most 6, keep variety of events.
  const shown = [...items]
    .filter((e) => (e.asset.severity ?? 0) >= 1 || items.length <= 6)
    .slice(0, 6);

  // Before/after: calmest earlier image vs worst flood image (same zone when possible).
  const worst = items.find((e) => e.asset.phase === 'DURING') ?? items[0];
  const { data: beforeRows } = await db
    .from('media_assets')
    .select(ASSET_COLS)
    .eq('organization_id', organizationId)
    .in('phase', ['BEFORE', 'BASELINE'])
    .order('severity', { ascending: true, nullsFirst: false })
    .limit(30);
  const candidates = ((beforeRows ?? []) as MediaAsset[]).filter((a) => a.id !== worst?.asset.id);
  // Prefer a normal-day photo from the SAME site as the flood photo; only fall back to another place if none exists.
  const afterSite = worst?.asset.zone_id ?? zone.id;
  const beforeAsset = candidates.find((a) => a.zone_id === afterSite) ?? candidates.find((a) => a.zone_id === zone.id) ?? candidates[0];
  const sameSite = Boolean(beforeAsset && worst && beforeAsset.zone_id && beforeAsset.zone_id === worst.asset.zone_id);

  let comparison: Parameters<typeof composeMarkdown>[0]['comparison'] = null;
  if (worst && beforeAsset) {
    const cmp = await createComparison(db, {
      organizationId,
      userId,
      before: beforeAsset,
      after: worst.asset,
      zoneId: zone.id,
      title: `${zone.name}: normal vs flooded`,
      sameSite,
    });
    comparison = {
      beforeId: beforeAsset.id,
      afterId: worst.asset.id,
      summary: cmp.summary ?? '',
      before: beforeAsset,
      after: worst.asset,
      sameSite,
    };
  }

  const nar = await narrative(zone, risk, weather, shown);
  const generatedAt = new Date();
  const title = `${zone.name}: ${risk.level.toLowerCase()} flood risk${weather.simulated ? ' (simulation)' : ''}, ${formatDate(generatedAt)}`;

  const markdown = composeMarkdown({
    zone,
    generatedAt,
    risk,
    weather,
    evidence: shown,
    comparison,
    summary: nar.summary,
    actions: nar.actions,
    heuristicUsed: shown.some((e) => e.analysis?.provider === 'metadata-heuristic'),
  });

  const { data: report, error } = await db
    .from('reports')
    .insert({
      organization_id: organizationId,
      zone_id: zone.id,
      title,
      content_markdown: markdown,
      risk_level: risk.level,
      risk_score: risk.score,
      weather,
      evidence: shown.map((e) => ({ asset_id: e.asset.id, severity: e.asset.severity })),
      llm_provider: nar.provider,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error || !report) throw new Error(`Could not save report: ${error?.message}`);

  // Provenance: record the exact derived URL used for every image in this report.
  const provenance = [...shown.map((e) => e.asset), ...(comparison ? [comparison.before, comparison.after] : [])].map((a) => ({
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
  if (provenance.length) await db.from('asset_provenance').insert(provenance);

  return report as Report;
}
