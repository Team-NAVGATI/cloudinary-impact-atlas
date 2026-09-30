/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // the architecture page embeds our own diagrams
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // @phosphor-icons/react ships ~3,000 icon modules behind one barrel file. Without this the bundler
    // processes all of them for every route (this alone was most of the 84 s compile and the 10k-module dev pages).
    optimizePackageImports: ['@phosphor-icons/react'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Generated, versioned diagrams: cache hard at the edge and in the browser.
      {
        source: '/diagrams/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

export default nextConfig;
