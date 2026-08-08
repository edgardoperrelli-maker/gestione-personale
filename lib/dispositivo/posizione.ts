// Posizione corrente, unica per web e shell nativa.
//
// Nella WebView Capacitor `navigator.geolocation` passa dal permesso del BROWSER,
// non da quello di sistema: su iOS il prompt o non compare o va concesso due
// volte. Il plugin nativo usa CoreLocation e chiede il permesso una volta sola,
// come si aspetta l'operatore che apre l'app in strada.
//
// Sul web resta l'API standard: la stessa codebase serve anche il browser.
import { isNativePlatform } from '../native';

export type Coordinate = { latitude: number; longitude: number };

/** Errore tipizzato: la UI distingue «negato» da «non disponibile». */
export class PosizioneNegata extends Error {
  constructor(message = 'Permesso di localizzazione negato') {
    super(message);
    this.name = 'PosizioneNegata';
  }
}

async function posizioneNativa(timeoutMs: number): Promise<Coordinate> {
  const { Geolocation } = await import('@capacitor/geolocation');

  let stato = await Geolocation.checkPermissions();
  if (stato.location !== 'granted') {
    stato = await Geolocation.requestPermissions({ permissions: ['location'] });
  }
  if (stato.location !== 'granted') throw new PosizioneNegata();

  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: timeoutMs,
  });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

function posizioneWeb(timeoutMs: number): Promise<Coordinate> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocalizzazione non disponibile'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(
        err.code === err.PERMISSION_DENIED ? new PosizioneNegata() : new Error(err.message),
      ),
      // Senza timeout il default da specifica è Infinity: un prompt di permesso
      // ignorato lascerebbe il pulsante filante per sempre.
      { timeout: timeoutMs, enableHighAccuracy: true },
    );
  });
}

export function posizioneCorrente(timeoutMs = 10_000): Promise<Coordinate> {
  return isNativePlatform() ? posizioneNativa(timeoutMs) : posizioneWeb(timeoutMs);
}
