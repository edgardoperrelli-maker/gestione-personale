/** @type {import('next').NextConfig} */
import withSerwistInit from '@serwist/next';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/pdf_sopralluoghi/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/pdf' },
          { key: 'Content-Disposition', value: 'inline' },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Il SW viene generato solo nel build di produzione: in `next dev --turbopack`
  // il plugin webpack non gira e il SW non esiste (atteso).
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
