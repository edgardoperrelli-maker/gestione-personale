/** Lato lungo massimo (px) per le foto compresse lato client. */
export const LATO_LUNGO_MAX = 1600;
/** Qualità JPEG usata da `toBlob` nel componente. */
export const JPEG_QUALITA = 0.8;

/**
 * Tetto di peso (byte) per una foto del "+". Oltre questa soglia il body multipart rischia di
 * arrivare TRONCATO al server su rete debole (→ `req.formData()` fallisce → invio bloccato): se la
 * foto resta più pesante, il componente riduce la QUALITÀ (non la risoluzione, così la matricola
 * resta leggibile) fino a rientrare. ~0,9 MB è un compromesso prudente che passa anche su LTE debole.
 */
export const MAX_FOTO_BYTES = 900_000;

/**
 * Qualità JPEG di ripiego, in ordine decrescente, tentate solo se la foto supera `MAX_FOTO_BYTES`
 * alla qualità piena. Restano SOTTO `JPEG_QUALITA` (0.8): il caso normale (foto già leggera) non le
 * usa mai ed è identico a prima. La risoluzione (`LATO_LUNGO_MAX`) non viene mai toccata.
 */
export const QUALITA_FALLBACK: readonly number[] = [0.6, 0.45, 0.3];

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
