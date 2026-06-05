import { isScaduto, entroRiapertura } from './scadenza';

export type RapportinoStato = 'in_corso' | 'inviato' | 'scaduto';

export function tokenStatus(
  r: { stato: RapportinoStato; data: string; riaperto_at?: string | null },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  if (r.riaperto_at && entroRiapertura(r.riaperto_at, nowIso)) return 'valido';
  return isScaduto(r.data, nowIso) ? 'scaduto' : 'valido';
}
