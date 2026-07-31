// utils/rapportini/idPiani.ts
// Lista di `piano_id` sicura da passare a un filtro `.in('id', …)`.
//
// `rapportini.piano_id` è NULLABILE dal 22/07 (migration 20260722100001): i rapportini
// -contenitore della Consuntivazione non nascono da un piano della Mappa. Un `null` lasciato
// nella lista arriva a PostgREST come la STRINGA "null" dentro `in.(…)` e Postgres rifiuta
// l'INTERA query — «invalid input syntax for type uuid: "null"». Chi ignora l'errore (il
// Riepilogo) resta senza NESSUN territorio, chi lo rilancia (l'agente) va in 500: in entrambi
// i casi basta UN rapportino senza piano nella finestra per portare giù tutto il resto.
export function idPianiPerLettura(righe: ReadonlyArray<{ piano_id: string | null }>): string[] {
  return [...new Set(righe.map((r) => r.piano_id).filter((id): id is string => typeof id === 'string' && id !== ''))];
}
