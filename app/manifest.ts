import type { MetadataRoute } from 'next';

// PWA installabile: il service worker (Serwist) c'era già, mancavano manifest e
// icone. Colori risolti dai token: canvas light oklch(0.965 0.006 250) = #f0f4f7,
// accento oklch(0.55 0.17 255) = #1570d1.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gestione Personale — Plenzich',
    short_name: 'Plenzich',
    description: 'Pianificazione operatori e rapportini.',
    start_url: '/hub',
    display: 'standalone',
    background_color: '#f0f4f7',
    theme_color: '#f0f4f7',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
