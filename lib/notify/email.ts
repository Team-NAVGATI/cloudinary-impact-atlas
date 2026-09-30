import type { Report, Zone } from '@/lib/domain';
import { RISK_STYLES, type RiskLevel } from '@/lib/utils';

export interface EmailResult {
  status: 'SENT' | 'PREPARED' | 'FAILED';
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const RISK_HEX: Record<RiskLevel, string> = { LOW: '1A7F54', MODERATE: 'A86F00', HIGH: 'C2540F', SEVERE: 'C0202F' };
export const riskHex = (l: RiskLevel) => RISK_HEX[l];

export function buildEmail(report: Report, zone: Zone | null, link: string, recipientName: string) {
  const w = report.weather as { next24hMm?: number; peakProb?: number; simulated?: boolean; kind?: string; items?: number };
  if (w?.kind === 'evidence') {
    const subject = `Evidence report: ${report.title}`;
    const text = `Dear ${recipientName},\n\nAn evidence report is ready (${w.items ?? 'several'} items, with photos, sources and traceability).\n\nOpen it here:\n${link}\n\nSent by Impact Atlas.`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f2ec;font-family:Arial,Helvetica,sans-serif;color:#12201a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dcd8cc;border-radius:14px"><tr><td style="padding:24px"><div style="display:inline-block;background:#0f5b45;color:#fff;font-weight:700;font-size:12px;letter-spacing:.08em;padding:6px 10px;border-radius:6px">EVIDENCE REPORT</div><h1 style="font-size:22px;line-height:1.25;margin:16px 0 8px">${esc(report.title)}</h1><p style="margin:0 0 16px;color:#5b675f;font-size:14px;line-height:1.5">Dear ${esc(recipientName)}, a new report is ready with photo evidence, sources and traceability.</p><a href="${esc(link)}" style="display:inline-block;background:#0f5b45;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px">Open the report</a></td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
  }
  const level = RISK_STYLES[report.risk_level].label.toUpperCase();
  const subject = `[${level}] Flood-Watch: ${zone?.name ?? 'Chennai'} situation report`;
  const simulated = w?.simulated ? ' (SIMULATED SCENARIO)' : '';
  const text =
    `Dear ${recipientName},\n\n` +
    `A new flood situation report is ready for ${zone?.name ?? 'your zone'}${simulated}.\n` +
    `Risk: ${level} (score ${report.risk_score}/100). Forecast rain next 24 h: ${w?.next24hMm ?? 'n/a'} mm.\n\n` +
    `Read the full report with photographic evidence, before/after comparison and recommended actions:\n${link}\n\n` +
    `Sent by Impact Atlas Flood-Watch.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#0f1720">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e5eb;border-radius:12px">
<tr><td style="padding:24px">
<div style="display:inline-block;background:#${RISK_HEX[report.risk_level]};color:#fff;font-weight:700;font-size:12px;letter-spacing:.08em;padding:6px 10px;border-radius:6px">${esc(level)} FLOOD RISK${esc(simulated)}</div>
<h1 style="font-size:22px;line-height:1.25;margin:16px 0 8px">${esc(report.title)}</h1>
<p style="margin:0 0 16px;color:#566170;font-size:14px;line-height:1.5">Dear ${esc(recipientName)}, a new situation report is ready for <b>${esc(zone?.name ?? 'your zone')}</b>. Score ${report.risk_score}/100. Rain expected in the next 24 hours: <b>${esc(String(w?.next24hMm ?? 'n/a'))} mm</b>.</p>
<a href="${esc(link)}" style="display:inline-block;background:#1e4fd8;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px">Open the full report</a>
<p style="margin:20px 0 0;color:#566170;font-size:12px">Includes photo evidence, before/after comparison and a prioritised action list.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendEmail(to: string, mail: { subject: string; text: string; html: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: 'PREPARED' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Flood-Watch <onboarding@resend.dev>',
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!res.ok) return { status: 'FAILED', error: (await res.text()).slice(0, 300) };
    return { status: 'SENT' };
  } catch (e) {
    return { status: 'FAILED', error: e instanceof Error ? e.message : 'Email request failed' };
  }
}
