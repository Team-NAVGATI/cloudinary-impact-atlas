/**
 * Cloudinary delivery URLs built from an asset's stored `secure_url`.
 * Every derived URL is a pure function of (original asset, transformation string), so it can be
 * re-created and audited. `recordProvenance` stores the pair so reports stay traceable.
 */

export const TRANSFORMS = {
  thumb: 'c_fill,g_auto,w_480,h_320,q_auto,f_auto',
  card: 'c_fill,g_auto,w_800,h_560,q_auto,f_auto',
  detail: 'c_limit,w_1600,q_auto,f_auto',
  compare: 'c_fill,g_auto,w_1200,h_800,q_auto,f_auto',
  report: 'c_limit,w_1200,q_auto,f_auto',
  analysis: 'c_limit,w_1000,q_auto:eco,f_jpg',
  nvidia: 'c_limit,w_768,q_auto:eco,f_jpg',
} as const;

export type TransformName = keyof typeof TRANSFORMS;

export function transformUrl(secureUrl: string, transformation: string): string {
  if (!secureUrl.includes('/upload/')) return secureUrl;
  return secureUrl.replace('/upload/', `/upload/${transformation}/`);
}

export function derive(secureUrl: string, name: TransformName): string {
  return transformUrl(secureUrl, TRANSFORMS[name]);
}

/** Cloudinary text overlays need commas and slashes double-encoded. */
export function overlayText(text: string): string {
  return encodeURIComponent(text).replace(/%2C/gi, '%252C').replace(/%2F/gi, '%252F');
}

export interface StoryCardInput {
  secureUrl: string;
  zone: string;
  headline: string;
  lines: string[];
  riskLabel: string;
  riskHex: string; // e.g. 'C0202F'
}

/**
 * "Story card": 4:5 share image built entirely with Cloudinary transformations
 * (smart crop, dimmed base, text overlays with badge background). No image is re-uploaded.
 */
export function storyCardUrl(input: StoryCardInput): { url: string; transformation: string } {
  const clean = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
  // In Cloudinary, the layer component defines the text (font, colour, width) and the
  // `fl_layer_apply` component places it (gravity, offsets).
  const chain = [
    'c_fill,g_auto,w_1080,h_1350',
    'e_brightness:-30',
    `l_text:Arial_34_bold_letter_spacing_6:${overlayText(' ' + clean(input.riskLabel.toUpperCase() + ' FLOOD RISK', 40) + ' ')},co_white,b_rgb:${input.riskHex}`,
    'fl_layer_apply,g_north_west,x_60,y_70',
    `l_text:Arial_30_bold_letter_spacing_4:${overlayText(clean(input.zone.toUpperCase(), 40))},co_rgb:DCE4F2`,
    'fl_layer_apply,g_north_west,x_60,y_150',
    `l_text:Arial_74_bold:${overlayText(clean(input.headline, 90))},co_white,c_fit,w_960`,
    'fl_layer_apply,g_south_west,x_60,y_330',
    ...input.lines.slice(0, 3).flatMap((line, i) => [
      `l_text:Arial_34:${overlayText(clean(line, 60))},co_rgb:E8ECF1,c_fit,w_960`,
      `fl_layer_apply,g_south_west,x_60,y_${240 - i * 56}`,
    ]),
    `l_text:Arial_24:${overlayText('Impact Atlas | Chennai Flood-Watch | Forecast: Open-Meteo')},co_rgb:AEB9C9`,
    'fl_layer_apply,g_south_west,x_60,y_60',
    'q_auto,f_jpg',
  ];
  const transformation = chain.join('/');
  return { url: transformUrl(input.secureUrl, transformation), transformation };
}

/** Video helpers (used when a video asset is uploaded): poster frame + short preview. */
export function videoPosterUrl(secureUrl: string): string {
  return secureUrl
    .replace('/video/upload/', '/video/upload/so_0,c_fill,g_auto,w_800,h_560,q_auto,f_jpg/')
    .replace(/\.[a-z0-9]+$/i, '.jpg');
}
