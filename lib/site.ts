/**
 * Public base URL used in emailed report links.
 * Order: explicit NEXT_PUBLIC_APP_URL, then Vercel's production domain, then the preview deployment URL,
 * then whatever host made the request. Works on localhost and on Vercel with no extra configuration.
 */
export function siteOrigin(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const deployment = process.env.VERCEL_URL;
  if (deployment) return `https://${deployment}`;
  return new URL(req.url).origin;
}
