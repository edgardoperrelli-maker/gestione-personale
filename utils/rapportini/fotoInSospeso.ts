import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';

/**
 * Conta i segnaposto foto (`blob-locale:…`) presenti in una mappa di risposte.
 * Gestisce valori scalari e array (un campo foto può contenere più path).
 */
export function contaFotoInSospeso(
  risposte: Record<string, unknown> | null | undefined,
): number {
  if (!risposte) return 0;
  let n = 0;
  for (const v of Object.values(risposte)) {
    if (Array.isArray(v)) {
      n += v.filter(isPlaceholderFoto).length;
    } else if (isPlaceholderFoto(v)) {
      n += 1;
    }
  }
  return n;
}
