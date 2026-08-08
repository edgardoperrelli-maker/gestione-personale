// Acquisizione foto dalla shell nativa.
//
// Sul web restano gli `input[type=file]` con `capture`: funzionano e non vanno
// toccati. Dentro la WebView invece hanno due difetti concreti per chi lavora in
// strada — il permesso fotocamera passa dal browser invece che da iOS, e su
// alcune versioni il picker si apre senza scorciatoia allo scatto diretto.
// Il plugin nativo usa UIImagePickerController e chiede il permesso di sistema
// una volta sola.
//
// Il file che torna da qui rientra nello STESSO percorso del web (compressione
// inclusa): nessun ramo separato da mantenere.
import { isNativePlatform } from '../native';

export type SorgenteFoto = 'fotocamera' | 'libreria';

/** True solo dove il plugin nativo è realmente disponibile. */
export function fotocameraNativaDisponibile(): boolean {
  return isNativePlatform();
}

/**
 * Scatta o sceglie una foto usando il plugin nativo.
 *
 * Torna `null` quando l'utente ANNULLA: chi chiama non deve interpretarlo come
 * "nativo non disponibile" e riaprire il picker web, altrimenti annullare
 * riaprirebbe subito una seconda schermata.
 */
export async function acquisisciFotoNativa(sorgente: SorgenteFoto): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  const source = sorgente === 'fotocamera' ? CameraSource.Camera : CameraSource.Photos;

  try {
    const scatto = await Camera.getPhoto({
      // La compressione vera la fa comprimiImmagine a valle: qui si resta alti
      // per non degradare due volte la stessa immagine.
      quality: 92,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source,
      promptLabelHeader: 'Foto',
      promptLabelPhoto: 'Scegli dalla libreria',
      promptLabelPicture: 'Scatta una foto',
      promptLabelCancel: 'Annulla',
    });

    if (!scatto.webPath) return null;

    const risposta = await fetch(scatto.webPath);
    const blob = await risposta.blob();
    const estensione = scatto.format || 'jpeg';
    const tipo = blob.type || `image/${estensione}`;

    return new File([blob], `foto-${Date.now()}.${estensione}`, { type: tipo });
  } catch {
    // getPhoto lancia sia sull'annullamento sia sul permesso negato, senza
    // distinguerli in modo affidabile fra le piattaforme. In entrambi i casi
    // l'esito per la UI è lo stesso: nessuna foto, e nessun fallback.
    return null;
  }
}
