/** @type {import('next').NextConfig} */
import withSerwistInit from '@serwist/next';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: process.cwd(),
  },
  // Router cache client: senza staleTimes ogni ritorno su un modulo già visitato
  // rifaceva l'intero round-trip RSC (middleware con chiamata auth inclusa).
  // 30s è accettabile per un gestionale: i dati "live" dei moduli si aggiornano
  // comunque via fetch/realtime lato client.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
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
