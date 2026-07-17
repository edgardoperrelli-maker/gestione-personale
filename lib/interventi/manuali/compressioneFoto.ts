/** Lato lungo massimo (px) per le foto compresse lato client. */
export const LATO_LUNGO_MAX = 1600;
/** Qualità JPEG usata da `toBlob` nel componente. */
export const JPEG_QUALITA = 0.8;

/**
 * Tetto di peso (byte) per una foto del "+". Oltre questa soglia il body multipart rischia di
 * arrivare TRONCATO al server su rete debole (→ `req.formData()` fallisce → invio bloccato): il
 * componente prova i passi di `TENTATIVI_COMPRESSIONE` finché la foto rientra. ~0,8 MB passa anche
 * su LTE debole.
 */
export const MAX_FOTO_BYTES = 800_000;

export type TentativoCompressione = { lato: number; qualita: number };

/**
 * Scaletta di compressione, dal più "ricco" al più leggero, provata FINCHÉ la foto scende sotto
 * `MAX_FOTO_BYTES`. Il primo passo (1600px @ 0.8) è il comportamento storico: una foto già leggera
 * si ferma lì ed è IDENTICA a prima. Solo se resta pesante si abbassa prima la qualità a piena
 * risoluzione, poi anche la risoluzione (1280 → 1024): passi indispensabili quando su certi telefoni
 * (iOS a bassa memoria) `toBlob` a piena risoluzione fallisce o produce comunque un file troppo
 * grande. 1024px restano ampiamente sufficienti a leggere una matricola. Garantisce un payload
 * piccolo (niente più invio del file originale full-size) → il body non si tronca più.
 */
export const TENTATIVI_COMPRESSIONE: readonly TentativoCompressione[] = [
  { lato: LATO_LUNGO_MAX, qualita: JPEG_QUALITA }, // 1600 @ 0.8 — caso normale, invariato
  { lato: LATO_LUNGO_MAX, qualita: 0.6 },
  { lato: 1280, qualita: 0.6 },
  { lato: 1024, qualita: 0.55 },
];

export interface Dimensioni {
  width: number;
  height: number;
}

/**
 * Calcola le dimensioni target ridimensionando in modo che il lato lungo
 * non superi `max` (default `LATO_LUNGO_MAX`), mantenendo l'aspect ratio.
 * Non ingrandisce mai (scala ≤ 1). Risultato arrotondato all'intero.
 */
export function dimensioniTarget(
  width: number,
  height: number,
  max: number = LATO_LUNGO_MAX,
): Dimensioni {
  const latoLungo = Math.max(width, height);
  const scala = latoLungo > max ? max / latoLungo : 1;
  return {
    width: Math.round(width * scala),
    height: Math.round(height * scala),
  };
}
