const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@diraschool/shared'],
  // Point to the monorepo root so Next.js traces dependencies correctly
  // and doesn't warn about multiple lockfiles.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      // Redirect www → non-www so Google only indexes one canonical version
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.diraschool.com' }],
        destination: 'https://diraschool.com/:path*',
        permanent: true,
      },
      // /favicon.ico doesn't exist as a file — redirect to the generated icon
      { source: '/favicon.ico', destination: '/icon', permanent: false },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: process.env.SENTRY_TUNNEL_ROUTE || '/_client-events',
}, {
  hideSourceMaps: true,
});
