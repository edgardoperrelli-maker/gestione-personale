// Periodo di valutazione KPI premialità: bimestre civile (gen-feb, mar-apr, …).
// Logica pura. La finestra bimestrale è coerente con MESI_VALUTAZIONE=2 in lib/premialita/acea.ts.

function ultimoGiornoMese(anno: number, mese1based: number): number {
  // new Date(anno, mese, 0) → giorno 0 del mese (0-based = mese1based) = ultimo giorno del mese precedente,
  // che in 1-based corrisponde a `mese1based`.
  return new Date(anno, mese1based, 0).getDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Dato un giorno (YYYY-MM-DD), ritorna l'intervallo del bimestre civile che lo contiene.
 * Es. 2026-06-03 → { inizio: '2026-05-01', fine: '2026-06-30' }.
 */
export function getPeriodoBimestrale(dataIso: string): { inizio: string; fine: string } {
  const [anno, mese] = dataIso.split('-').map(Number);
  const meseInizio = mese % 2 === 1 ? mese : mese - 1; // mese dispari di apertura del bimestre
  const meseFine = meseInizio + 1;
  return {
    inizio: `${anno}-${pad(meseInizio)}-01`,
    fine: `${anno}-${pad(meseFine)}-${pad(ultimoGiornoMese(anno, meseFine))}`,
  };
}
