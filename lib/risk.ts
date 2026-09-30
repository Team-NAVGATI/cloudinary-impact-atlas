import { imdClass, type WeatherSnapshot } from '@/lib/weather/openmeteo';
import type { RiskLevel } from '@/lib/utils';

export interface EvidenceSummary {
  /** highest documented flood severity (0-3) among analysed evidence for the zone */
  maxSeverity: number;
  /** number of evidence images flagging a blocked drain or garbage */
  drainIssues: number;
  count: number;
}

export interface RiskDriver {
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  drivers: RiskDriver[];
}

/**
 * Transparent, rule-based score (0-100). Every point is explained in `drivers`,
 * so an officer can see exactly why a zone is HIGH. Thresholds follow the IMD 24 h rainfall classes.
 */
export function computeRisk(weather: WeatherSnapshot, evidence: EvidenceSummary): RiskResult {
  const drivers: RiskDriver[] = [];
  const cls = imdClass(weather.next24hMm);

  const rainPts = [0, 4, 12, 26, 38, 45][cls.rank];
  drivers.push({
    label: 'Forecast rain (24 h)',
    points: rainPts,
    max: 45,
    detail: `${weather.next24hMm} mm expected, IMD class: ${cls.label}${weather.simulated ? ' (simulated)' : ''}`,
  });

  const probPts = Math.round((weather.peakProb / 100) * 10);
  drivers.push({
    label: 'Rain probability',
    points: probPts,
    max: 10,
    detail: `Peak chance of rain in the next 72 h: ${weather.peakProb}%`,
  });

  const wetPts = weather.past48hMm >= 50 ? 10 : weather.past48hMm >= 20 ? 6 : weather.past48hMm >= 8 ? 3 : 0;
  drivers.push({
    label: 'Saturated ground',
    points: wetPts,
    max: 10,
    detail: `${weather.past48hMm} mm fell in the last 48 h`,
  });

  let riverPts = 0;
  let riverDetail = 'River discharge data not available for this point';
  if (weather.river?.ratio != null) {
    riverPts = weather.river.ratio >= 3 ? 15 : weather.river.ratio >= 1.5 ? 8 : weather.river.ratio >= 1.1 ? 3 : 0;
    riverDetail = `Peak discharge ${weather.river.peak3d?.toFixed(1)} m³/s is ${weather.river.ratio}× the seasonal mean`;
  }
  drivers.push({ label: 'River level', points: riverPts, max: 15, detail: riverDetail });

  const exposurePts = evidence.maxSeverity * 4;
  drivers.push({
    label: 'Documented flood exposure',
    points: exposurePts,
    max: 12,
    detail: evidence.count
      ? `Worst documented severity in this zone: ${evidence.maxSeverity} of 3 (${evidence.count} evidence items)`
      : 'No analysed evidence for this zone yet',
  });

  const drainPts = Math.min(8, evidence.drainIssues * 4);
  drivers.push({
    label: 'Drain and garbage issues',
    points: drainPts,
    max: 8,
    detail: `${evidence.drainIssues} evidence item(s) show blocked drains or garbage`,
  });

  const score = Math.min(100, drivers.reduce((s, d) => s + d.points, 0));
  const level: RiskLevel = score >= 70 ? 'SEVERE' : score >= 48 ? 'HIGH' : score >= 24 ? 'MODERATE' : 'LOW';
  return { score, level, drivers };
}
