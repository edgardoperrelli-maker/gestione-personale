export type RapportinoStato = 'in_corso' | 'inviato' | 'scaduto';

export function tokenStatus(
  r: { stato: RapportinoStato; expires_at: string },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  if (new Date(nowIso).getTime() > new Date(r.expires_at).getTime()) return 'scaduto';
  return 'valido';
}
