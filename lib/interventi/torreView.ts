// Logica pura per la torre di controllo: colore per stato e raggruppamento
// degli interventi per operatore con conteggi. Nessun accesso al DB.
import { attivitaUnificataDisplay } from '@/lib/attivita/attivitaDisplay';

export type TonoTorre = 'ok' | 'ko' | 'attesa' | 'corso' | 'annullato' | 'da_assegnare';

/** Mappa stato+esito di un intervento a un tono cromatico per la board/mappa. */
export function coloreStato(stato: string, esito: string | null | undefined): TonoTorre {
  if (stato === 'completato') return esito === 'eseguito_positivo' ? 'ok' : 'ko';
  if (stato === 'assegnato') return 'attesa';
  if (stato === 'in_viaggio' || stato === 'sul_posto' || stato === 'in_esecuzione') return 'corso';
  if (stato === 'annullato') return 'annullato';
  return 'da_assegnare';
}

type ConInterventoBase = { staff_id: string | null; stato: string; esito: string | null };
type OperatoreBase = { id: string; display_name: string };

export type ConteggiTorre = { totale: number; assegnati: number; fatti: number; nonFatti: number };

export type GruppoOperatore<T> = {
  operatore: { id: string | null; display_name: string };
  conteggi: ConteggiTorre;
  interventi: T[];
};

function conta<T extends ConInterventoBase>(items: T[]): ConteggiTorre {
  let assegnati = 0;
  let fatti = 0;
  let nonFatti = 0;
  for (const it of items) {
    if (it.stato === 'assegnato') assegnati += 1;
    else if (it.stato === 'completato') {
      if (it.esito === 'eseguito_positivo') fatti += 1;
      else nonFatti += 1;
    }
  }
  return { totale: items.length, assegnati, fatti, nonFatti };
}

/** Valore di selezione per il gruppo "Non assegnati" (distinto da null = nessuna selezione). */
export const SENTINELLA_NON_ASSEGNATI = '__na__';

/**
 * Applica i filtri della torre: territorio e operatore.
 * - selTerr: id territorio o null (nessun filtro territorio)
 * - selStaff: id operatore, oppure SENTINELLA_NON_ASSEGNATI per i non assegnati, oppure null
 */
export function filtraInterventi<T extends { staff_id: string | null; territorio_id: string | null }>(
  items: T[],
  selTerr: string | null,
  selStaff: string | null,
): T[] {
  let out = selTerr ? items.filter((i) => i.territorio_id === selTerr) : items;
  if (selStaff === SENTINELLA_NON_ASSEGNATI) out = out.filter((i) => i.staff_id == null);
  else if (selStaff) out = out.filter((i) => i.staff_id === selStaff);
  return out;
}

/**
 * Raggruppa gli interventi per operatore. Include TUTTI gli operatori passati
 * (anche con zero interventi) e, in coda, un gruppo "Non assegnati" (staff_id
 * null) solo se esistono interventi senza operatore.
 */
export function raggruppaPerOperatore<T extends ConInterventoBase>(
  interventi: T[],
  operatori: OperatoreBase[],
): GruppoOperatore<T>[] {
  const perStaff = new Map<string, T[]>();
  const nonAssegnati: T[] = [];
  for (const it of interventi) {
    if (it.staff_id == null) {
      nonAssegnati.push(it);
    } else {
      const arr = perStaff.get(it.staff_id) ?? [];
      arr.push(it);
      perStaff.set(it.staff_id, arr);
    }
  }

  const gruppi: GruppoOperatore<T>[] = operatori.map((op) => {
    const items = perStaff.get(op.id) ?? [];
    return { operatore: { id: op.id, display_name: op.display_name }, conteggi: conta(items), interventi: items };
  });

  if (nonAssegnati.length > 0) {
    gruppi.push({
      operatore: { id: null, display_name: 'Non assegnati' },
      conteggi: conta(nonAssegnati),
      interventi: nonAssegnati,
    });
  }

  return gruppi;
}

/**
 * Filtra i gruppi da mostrare in colonna: con un territorio selezionato mostra
 * solo gli operatori che hanno lavori (interventi.length > 0); senza territorio,
 * tutti. `gruppi` è già calcolato sugli interventi filtrati per territorio.
 */
export function operatoriVisibili<T>(
  gruppi: GruppoOperatore<T>[],
  selTerr: string | null,
): GruppoOperatore<T>[] {
  return selTerr ? gruppi.filter((g) => g.interventi.length > 0) : gruppi;
}

/**
 * Costruisce le due righe del dettaglio lavoro (stile rapportino).
 * primario = nominativo || ODL || "Intervento" (usa || così la stringa vuota ripiega);
 * secondario = indirizzo, comune CAP · ODL · PDR · matr. · attività · fascia (solo presenti,
 * ODL omesso se è già il primario).
 */
export function rigaDettaglio(it: {
  nominativo: string | null;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  fascia_oraria: string | null;
}): { primario: string; secondario: string } {
  const t = (s: string | null | undefined) => (s ?? '').trim();
  const odl = t(it.odl);
  const matr = t(it.matricola_contatore);
  const pdr = t(it.pdr);
  // Intestazione: nominativo → ODL → matricola → PDR → fallback generico.
  // Gli ACEA senza ODL sono identificati dalla matricola: meglio mostrarla che "Intervento".
  const primario =
    t(it.nominativo) || odl || (matr ? `matr. ${matr}` : '') || (pdr ? `PDR ${pdr}` : '') || 'Intervento';
  const luogo = [t(it.indirizzo), t(it.comune)].filter(Boolean).join(', ');
  const luogoCap = [luogo, t(it.cap)].filter(Boolean).join(' ');
  const parti = [
    luogoCap || null,
    odl && primario !== odl ? `ODL ${odl}` : null,
    pdr && primario !== `PDR ${pdr}` ? `PDR ${pdr}` : null,
    matr && primario !== `matr. ${matr}` ? `matr. ${matr}` : null,
    attivitaUnificataDisplay(it.intervento_tipo) || null, // display unificato (storage tiene il dettaglio)
    t(it.fascia_oraria) || null,
  ].filter(Boolean);
  return { primario, secondario: parti.join(' · ') };
}

/**
 * Ordina la lista per orario di salvataggio dell'operatore (`chiuso_at`, = ora di
 * compilazione della voce) in modo CRESCENTE. Gli interventi non ancora salvati
 * (chiuso_at null, es. "da fare") finiscono in fondo. Ordinamento stabile: a parità
 * di orario (o tra i null) si preserva l'ordine d'ingresso.
 */
export function ordinaPerChiusura<T extends { chiuso_at: string | null }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    if (!a.chiuso_at && !b.chiuso_at) return 0;
    if (!a.chiuso_at) return 1;
    if (!b.chiuso_at) return -1;
    return a.chiuso_at < b.chiuso_at ? -1 : a.chiuso_at > b.chiuso_at ? 1 : 0;
  });
}
