import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['node:sqlite', 'mammoth', 'yauzl', 'sanitize-html', 'sharp'],
  outputFileTracingIncludes: { '/*': ['./scripts/convert-docx.cjs'] },
  outputFileTracingExcludes: {
    '/*': ['./data/**', './uploads/**', './.test-data/**', './.local/**'],
  },
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  async headers() {
    return [
      {
        source: '/materials/:id/preview',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/((?!materials/[^/]+/preview$).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
