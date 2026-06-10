'use client';

import { useEffect } from 'react';

/**
 * Registra il service worker SOLO dove questo componente è montato (pagine operatore).
 * In sviluppo (`next dev --turbopack`) il SW non viene generato: la guardia su
 * NODE_ENV evita un 404 su /sw.js. In produzione/preview Vercel il SW esiste.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* registrazione non critica: l'app resta usabile online */
    });
  }, []);
  return null;
}
