// PURA: valorizzazione economica di un ordine ACEA = prezzo della sua ATTIVITÀ, alla data dell'intervento.
// Il listino ha validità temporale (ACEA cambia le tariffe nei SAL): si seleziona la tariffa attiva
// che copre la data. Nessuna premialità qui (valore = prezzo × quantità, quantità di norma 1).

export interface ListinoRiga {
  id: string;
  attivita: string; // chiave normalizzata (vedi normalizzaAttivita)
  prezzo: number;
  valido_dal: string; // 'YYYY-MM-DD'
  valido_al: string | null; // null = aperto
  attivo: boolean;
}

export interface PrezzoSelezionato {
  prezzo: number;
  listinoId: string;
}

/** Arrotonda a 2 decimali (half-up, allineato a round(numeric,2) di Postgres). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Tariffa attiva per (attività, data). Le date ISO 'YYYY-MM-DD' si confrontano lessicograficamente.
 * Periodo inclusivo ai bordi. A parità di copertura vince il `valido_dal` più recente (deterministico).
 */
export function prezzoPerData(
  listino: ListinoRiga[],
  attivita: string | null,
  data: string,
): PrezzoSelezionato | null {
  if (!attivita) return null;
  let scelta: ListinoRiga | null = null;
  for (const riga of listino) {
    if (!riga.attivo || riga.attivita !== attivita) continue;
    if (riga.valido_dal > data) continue;
    if (riga.valido_al != null && riga.valido_al < data) continue;
    if (scelta == null || riga.valido_dal > scelta.valido_dal) scelta = riga;
  }
  return scelta ? { prezzo: scelta.prezzo, listinoId: scelta.id } : null;
}

/** Valore di un ordine = prezzo × quantità (default 1), arrotondato a 2 decimali. */
export function valoreRiga(prezzo: number, quantita = 1): number {
  const p = Number.isFinite(prezzo) ? prezzo : 0;
  const q = Number.isFinite(quantita) ? quantita : 0;
  return round2(p * q);
}
