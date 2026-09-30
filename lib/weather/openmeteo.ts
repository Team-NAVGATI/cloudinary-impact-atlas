/**
 * Free, key-less weather + river data (Open-Meteo forecast API and Open-Meteo GloFAS flood API).
 * Used for the live Chennai risk score. All numbers in a report come from this response.
 */

export interface DailyRain {
  date: string;
  precipSum: number;
  probMax: number | null;
}

export interface RiverSignal {
  dischargeToday: number | null;
  meanToday: number | null;
  peak3d: number | null;
  ratio: number | null; // peak3d / mean
}

export interface WeatherSnapshot {
  fetchedAt: string;
  lat: number;
  lng: number;
  past48hMm: number;
  next24hMm: number;
  next72hMm: number;
  peakHourMm: number;
  peakProb: number;
  daily: DailyRain[];
  river: RiverSignal | null;
  simulated: boolean;
  scenarioLabel?: string;
  sources: string[];
}

/** IMD 24-hour rainfall classes (mm). */
export function imdClass(mm24: number): { label: string; rank: number } {
  if (mm24 >= 204.5) return { label: 'Extremely heavy', rank: 5 };
  if (mm24 >= 115.6) return { label: 'Very heavy', rank: 4 };
  if (mm24 >= 64.5) return { label: 'Heavy', rank: 3 };
  if (mm24 >= 15.6) return { label: 'Moderate', rank: 2 };
  if (mm24 >= 2.5) return { label: 'Light', rank: 1 };
  return { label: 'Little or none', rank: 0 };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export async function fetchWeather(lat: number, lng: number): Promise<WeatherSnapshot> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=precipitation,precipitation_probability&daily=precipitation_sum,precipitation_probability_max` +
    `&past_days=2&forecast_days=3&timezone=Asia%2FKolkata`;
  const floodUrl =
    `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}` +
    `&daily=river_discharge,river_discharge_mean,river_discharge_max&forecast_days=3`;

  const [fRes, rRes] = await Promise.allSettled([
    fetch(forecastUrl, { next: { revalidate: 900 } }),
    fetch(floodUrl, { next: { revalidate: 3600 } }),
  ]);

  if (fRes.status !== 'fulfilled' || !fRes.value.ok) {
    throw new Error('Weather service unavailable (Open-Meteo forecast)');
  }
  const f = await fRes.value.json();

  const times: string[] = f.hourly?.time ?? [];
  const precip: number[] = (f.hourly?.precipitation ?? []).map((v: number | null) => v ?? 0);
  const prob: number[] = (f.hourly?.precipitation_probability ?? []).map((v: number | null) => v ?? 0);

  // Current hour in IST, matching the API's timezone.
  const nowIst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 13);
  let idx = times.findIndex((t) => t.slice(0, 13) >= nowIst);
  if (idx < 0) idx = Math.max(0, times.length - 1);

  const past = precip.slice(Math.max(0, idx - 48), idx);
  const next24 = precip.slice(idx, idx + 24);
  const next72 = precip.slice(idx, idx + 72);
  const probNext = prob.slice(idx, idx + 72);

  // past_days=2 puts two past days first; keep only today + the next two forecast days.
  const daily: DailyRain[] = (f.daily?.time ?? [])
    .map((date: string, i: number) => ({
      date,
      precipSum: f.daily.precipitation_sum?.[i] ?? 0,
      probMax: f.daily.precipitation_probability_max?.[i] ?? null,
    }))
    .slice(-3);

  let river: RiverSignal | null = null;
  if (rRes.status === 'fulfilled' && rRes.value.ok) {
    try {
      const r = await rRes.value.json();
      const d: number[] = r.daily?.river_discharge ?? [];
      const mean: number[] = r.daily?.river_discharge_mean ?? [];
      const max: number[] = r.daily?.river_discharge_max ?? [];
      const peak = max.length ? Math.max(...max) : null;
      // GloFAS is unreliable for tiny streams, so ignore the ratio unless the river has a meaningful flow.
      const meaningful = (mean[0] ?? 0) >= 1;
      river = {
        dischargeToday: d[0] ?? null,
        meanToday: mean[0] ?? null,
        peak3d: peak,
        ratio: meaningful && peak !== null ? Number((peak / mean[0]).toFixed(2)) : null,
      };
    } catch {
      river = null;
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    lat,
    lng,
    past48hMm: Number(sum(past).toFixed(1)),
    next24hMm: Number(sum(next24).toFixed(1)),
    next72hMm: Number(sum(next72).toFixed(1)),
    peakHourMm: next72.length ? Math.max(...next72) : 0,
    peakProb: probNext.length ? Math.max(...probNext) : 0,
    daily,
    river,
    simulated: false,
    sources: ['Open-Meteo forecast', ...(river ? ['Open-Meteo GloFAS flood API'] : [])],
  };
}

/**
 * What-if scenario: overlay a hypothetical 24 h rainfall onto a real snapshot.
 * Always flagged `simulated` so reports cannot present it as a forecast.
 */
export function simulateScenario(base: WeatherSnapshot, rain24Mm: number, label: string): WeatherSnapshot {
  const perDay = [rain24Mm, rain24Mm * 0.6, rain24Mm * 0.3];
  return {
    ...base,
    next24hMm: rain24Mm,
    next72hMm: Number(sum(perDay).toFixed(1)),
    peakHourMm: Number((rain24Mm / 8).toFixed(1)),
    peakProb: 95,
    past48hMm: Math.max(base.past48hMm, Number((rain24Mm * 0.25).toFixed(1))),
    daily: base.daily.slice(-3).map((d, i) => ({ ...d, precipSum: Number(perDay[i].toFixed(1)), probMax: 95 })),
    simulated: true,
    scenarioLabel: label,
  };
}
