import { isScaduto } from './scadenza';

export type RapportinoStato = 'in_corso' | 'inviato' | 'scaduto';

export function tokenStatus(
  r: { stato: RapportinoStato; data: string },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  return isScaduto(r.data, nowIso) ? 'scaduto' : 'valido';
}
