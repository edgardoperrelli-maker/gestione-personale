// Finestra temporale navigabile del modulo Live: oggi e fino a 7 giorni indietro.
// Puro: riceve `oggi` (YYYY-MM-DD) per essere deterministico/testabile.
import { addDaysIso } from '@/lib/dashboard/addDaysIso';

/** Data minima navigabile nel Live: oggi − 7 giorni. */
export function minDataLive(oggi: string): string {
  return addDaysIso(oggi, -7);
}

/**
 * Clampa la data richiesta nella finestra [oggi−7, oggi]. Se `data` è assente,
 * malformata, oltre la settimana o nel futuro, ritorna `oggi`.
 */
export function clampDataLive(data: string | undefined | null, oggi: string): string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return oggi;
  if (data < minDataLive(oggi) || data > oggi) return oggi;
  return data;
}
