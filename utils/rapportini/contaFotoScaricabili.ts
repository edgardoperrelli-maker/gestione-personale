import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';

/**
 * Conta le foto SCARICABILI (path di storage reali `rapportini/…`) tra i campi
 * foto indicati di una voce. I segnaposto `blob-locale:` non si contano: non sono
 * ancora caricati sul server.
 */
export function contaFotoScaricabili(
  risposte: Record<string, unknown> | null | undefined,
  chiaviFoto: string[],
): number {
  if (!risposte) return 0;
  let n = 0;
  for (const chiave of chiaviFoto) {
    for (const p of comeArrayFoto(risposte[chiave])) {
      if (p.startsWith('rapportini/')) n += 1;
    }
  }
  return n;
}
