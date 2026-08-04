// lib/interventi/pianoResiduo.ts
// PURA: il criterio con cui l'anti-duplicato (POST /api/mappa/piani, agente/assegna) decide se
// un piano di (data, territorio) è un RESIDUO eliminabile prima di crearne uno nuovo.
//
// Storicamente bastava «nessun rapportino». Con l'unificazione commessa i piani ospitano anche
// interventi del REGISTRO (`created_from_mappa=false`, es. appena pianificati e non ancora
// generati): eliminarli col piano cancellerebbe lavoro che la Mappa non sa ricreare — i suoi
// task vivono nel registro, non nel file Excel. Quindi: eliminabile SOLO se non ha né
// rapportini né interventi del registro.

export function pianoResiduoEliminabile(
  nRapportini: number,
  nInterventiRegistro: number,
): boolean {
  return nRapportini === 0 && nInterventiRegistro === 0;
}
