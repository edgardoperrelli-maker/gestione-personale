/**
 * Comprime un'immagine lato client per ridurre l'occupazione in IndexedDB e il
 * peso dell'upload. Ridimensiona al lato massimo `maxLato` e ricodifica in JPEG.
 * In caso di errore restituisce il file originale (best-effort).
 */
export async function comprimiImmagine(file: File, maxLato = 1600, qualita = 0.7): Promise<Blob> {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file);
    const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scala);
    const h = Math.round(bitmap.height * scala);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (canvas instanceof OffscreenCanvas) {
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: qualita });
    }
    return await new Promise<Blob>((resolve) =>
      (canvas as HTMLCanvasElement).toBlob((b) => resolve(b ?? file), 'image/jpeg', qualita),
    );
  } catch {
    return file;
  }
}
