/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';
import { drenaTuttiIToken, TAG_BACKGROUND_SYNC } from '@/lib/offline/backgroundSync';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const SETTE_GIORNI = 7 * 24 * 60 * 60;
const TRENTA_GIORNI = 30 * 24 * 60 * 60;

/** Navigazioni alle pagine operatore: rete-poi-cache (offline serve l'ultima versione vista). */
const navigazioneOperatore: RuntimeCaching = {
  matcher: ({ request, url }) =>
    request.mode === 'navigate' &&
    (url.pathname.startsWith('/r/') || url.pathname.startsWith('/agenda/')),
  handler: new NetworkFirst({
    cacheName: 'operatore-pagine',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: SETTE_GIORNI })],
  }),
};

/** GET delle API operatore in sola lettura: rete-poi-cache. */
const apiOperatore: RuntimeCaching = {
  matcher: ({ request, url }) =>
    request.method === 'GET' && url.pathname.startsWith('/api/r/'),
  handler: new NetworkFirst({
    cacheName: 'operatore-api',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: SETTE_GIORNI })],
  }),
};

/** Asset statici stessa-origine (JS/CSS/font/worker): il codice del form gira offline. */
const assetStatici: RuntimeCaching = {
  matcher: ({ request, sameOrigin }) =>
    sameOrigin && ['style', 'script', 'worker', 'font'].includes(request.destination),
  handler: new StaleWhileRevalidate({ cacheName: 'asset-statici' }),
};

/** Immagini stessa-origine. */
const immagini: RuntimeCaching = {
  matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
  handler: new CacheFirst({
    cacheName: 'immagini',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: TRENTA_GIORNI })],
  }),
};

// NB: NON usiamo defaultCache come catch-all per le navigazioni: così le pagine
// non-operatore (/hub, login) NON vengono servite dalla cache (online invariate,
// offline falliscono normalmente). `defaultCache` è importato solo per riferimento
// e NON incluso, per restare aderenti al perimetro deciso nello spec.
void defaultCache;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [navigazioneOperatore, apiOperatore, assetStatici, immagini],
});

serwist.addEventListeners();

// Background Sync (Android/Chromium): alla connettività, drena la coda anche ad app chiusa.
// iOS Safari non supporta l'evento 'sync' → no-op lì (coperto dai trigger ad-app-aperta).
self.addEventListener('sync', (event) => {
  const e = event as Event & { tag?: string; waitUntil(p: Promise<unknown>): void };
  if (e.tag === TAG_BACKGROUND_SYNC) {
    e.waitUntil(drenaTuttiIToken());
  }
});
