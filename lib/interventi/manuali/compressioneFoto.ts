/** Lato lungo massimo (px) per le foto compresse lato client. */
export const LATO_LUNGO_MAX = 1600;
/** Qualità JPEG usata da `toBlob` nel componente. */
export const JPEG_QUALITA = 0.8;

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
