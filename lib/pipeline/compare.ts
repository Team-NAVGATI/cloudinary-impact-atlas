import type { Db } from '@/lib/auth';
import type { AiAnalysis, Comparison, MediaAsset } from '@/lib/domain';
import { completeText, sanitizeLlmMarkdown } from '@/lib/ai/llm';
import { SEVERITY_LABELS } from '@/lib/utils';

async function latestAnalysis(db: Db, assetId: string): Promise<AiAnalysis | null> {
  const { data } = await db
    .from('ai_analyses')
    .select('*')
    .eq('media_asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AiAnalysis) ?? null;
}

const SIGNAL_LABELS: Record<string, string> = {
  water_visible: 'standing or flowing water',
  blocked_drain: 'blocked drains',
  garbage: 'garbage',
  structures_submerged: 'submerged structures',
  people_at_risk: 'people at risk',
  river_overflow: 'river overflow',
};

export function describeChange(
  before: { caption: string; severity: number; signals: Record<string, unknown> },
  after: { caption: string; severity: number; signals: Record<string, unknown> }
) {
  const newSignals = Object.keys(SIGNAL_LABELS)
    .filter((k) => Boolean(after.signals?.[k]) && !before.signals?.[k])
    .map((k) => SIGNAL_LABELS[k]);
  const delta = after.severity - before.severity;
  const trend =
    delta > 0
      ? `Flood severity rose from ${before.severity} (${SEVERITY_LABELS[before.severity]}) to ${after.severity} (${SEVERITY_LABELS[after.severity]}).`
      : delta < 0
        ? `Flood severity fell from ${before.severity} (${SEVERITY_LABELS[before.severity]}) to ${after.severity} (${SEVERITY_LABELS[after.severity]}), which indicates recovery.`
        : `Flood severity is unchanged at ${after.severity} (${SEVERITY_LABELS[after.severity]}).`;
  const signalText = newSignals.length ? ` New in the later image: ${newSignals.join(', ')}.` : '';
  return {
    text: `${trend}${signalText}`,
    changeScore: Math.max(0, Math.min(3, Math.abs(delta))),
  };
}

export async function createComparison(
  db: Db,
  args: {
    organizationId: string;
    userId: string;
    before: MediaAsset;
    after: MediaAsset;
    zoneId?: string | null;
    title?: string | null;
    sameSite?: boolean;
  }
): Promise<Comparison> {
  const [bA, aA] = await Promise.all([latestAnalysis(db, args.before.id), latestAnalysis(db, args.after.id)]);
  const b = {
    caption: bA?.description || args.before.title || 'Earlier image',
    severity: bA?.severity ?? args.before.severity ?? 0,
    signals: (bA?.environmental_signals as Record<string, unknown>) ?? {},
  };
  const a = {
    caption: aA?.description || args.after.title || 'Later image',
    severity: aA?.severity ?? args.after.severity ?? 0,
    signals: (aA?.environmental_signals as Record<string, unknown>) ?? {},
  };
  const change = describeChange(b, a);

  const sameSite = args.sameSite ?? Boolean(args.before.zone_id && args.before.zone_id === args.after.zone_id);
  // Different places cannot show "change over time", so say what the pair is (a visual reference) instead of implying a trend.
  const lead = sameSite ? change.text : `These photos are from different places, so this is a visual reference and not a change over time. ${change.text}`;
  let summary = `${lead}\n\nEarlier: ${b.caption}\n\nLater: ${a.caption}`;
  let provider = 'rules';

  const llm = await completeText({
    system:
      'You are a flood-monitoring analyst writing for a municipal officer. Write plain, factual English. Never invent facts beyond the input.',
    user: `Write a 2-3 sentence comparison of two photos using only these facts.\n${JSON.stringify({ before: b, after: a, computed_change: lead })}\nIf the places differ, say it is a reference comparison, not a change over time. Do not use headings, lists, or code.`,
    maxTokens: 220,
  });
  if (llm) {
    const clean = sanitizeLlmMarkdown(llm.text, 700);
    if (clean.length > 40) {
      summary = sameSite ? clean : `These photos are from different places, so this is a visual reference and not a change over time. ${clean}`;
      provider = llm.provider;
    }
  }

  const { data, error } = await db
    .from('comparisons')
    .insert({
      organization_id: args.organizationId,
      zone_id: args.zoneId ?? args.after.zone_id ?? args.before.zone_id ?? null,
      before_asset_id: args.before.id,
      after_asset_id: args.after.id,
      title: args.title ?? `${args.before.title ?? 'Before'} vs ${args.after.title ?? 'After'}`.slice(0, 140),
      summary,
      change_score: change.changeScore,
      provider,
      created_by: args.userId,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not save comparison: ${error.message}`);
  return data as Comparison;
}
