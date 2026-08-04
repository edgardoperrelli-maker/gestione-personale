import { Capacitor } from '@capacitor/core';

/**
 * True solo dentro la shell nativa Capacitor (Android/iOS). Nel browser e in SSR
 * torna false: i rami nativi del codice web (es. nascondere il prompt "installa
 * PWA" dentro l'app) passano tutti da qui.
 */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}
