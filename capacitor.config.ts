import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Shell nativa «Gestilab Plenzich» (piano docs/superpowers/plans/2026-08-04-app-mobile-capacitor.md).
 *
 * Architettura: WebView puntata alla web app IN PRODUZIONE (`server.url`) — una
 * sola codebase, gli aggiornamenti restano deploy Vercel, si ripassa dagli store
 * solo quando cambia la shell (plugin/icone/splash).
 *
 * `webDir` NON è l'app: è lo stub locale col fallback offline (native-shell/),
 * mostrato solo se il primo caricamento remoto fallisce. Per provare una build
 * contro un ambiente diverso, cambiare `server.url` in locale SENZA committare.
 */
const config: CapacitorConfig = {
  appId: 'it.gestilab.personale',
  appName: 'Gestilab Plenzich',
  webDir: 'native-shell',
  server: {
    url: 'https://gestione-personale.vercel.app',
    cleartext: false,
  },
  ios: {
    // Con WKAppBoundDomains in Info.plist, questo flag accende i service worker
    // nella WebView (cache pagine Serwist → avvio offline anche a freddo).
    // Nota dev: puntando server.url fuori dai domini app-bound la navigazione
    // viene bloccata da iOS — per prove su LAN togliere ENTRAMBI, senza committare.
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
