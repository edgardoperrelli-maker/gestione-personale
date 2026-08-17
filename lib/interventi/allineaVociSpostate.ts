// lib/interventi/allineaVociSpostate.ts
// L'applicazione al database della regola di `vociSpostamento.ts`: quando la pianificazione
// SPOSTA un intervento su un altro operatore o un altro giorno, la voce lasciata indietro va
// tolta dal rapportino di prima — altrimenti lo stesso ODL resta a schermo sotto due esecutori
// e i due si sovrascrivono l'esito a vicenda.
//
// Best-effort per scelta: la pianificazione ha GIÀ scritto lo spostamento quando questa gira, e
// un fallimento qui non deve annullarlo. Il residuo che resta indietro è visibile — è una riga
// in più nello storico — mentre uno spostamento rifiutato a metà lascia l'ODL su un operatore
// che non ci va più, che è il danno peggiore. Quello che non si riesce a fare si dice.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  avvisoVociConservate, vociDaSpostamento,
  type DestinazioneSpostamento, type VoceDaSpostamento,
} from '@/lib/interventi/vociSpostamento';

export type EsitoAllineamento = {
  /** Quante voci vuote sono state tolte dal rapportino di provenienza. */
  rimosse: number;
  /** Avviso per l'ufficio sulle voci rimaste indietro, `null` se non ce ne sono. */
  avviso: string | null;
};

const NIENTE: EsitoAllineamento = { rimosse: 0, avviso: null };

/**
 * Toglie le voci rimaste sul rapportino sbagliato dopo lo spostamento degli `interventoIds`.
 *
 * `rapportini!inner`: la voce senza rapportino padre non esiste (FK NOT NULL), e l'inner join
 * è ciò che porta su staff, giorno e stato — i tre campi su cui la regola decide.
 *
 * Le righe-misuratore della voce se ne vanno da sole: `rapportino_righe.voce_id` è
 * `on delete cascade`.
 */
export async function allineaVociSpostate(
  db: SupabaseClient,
  interventoIds: readonly string[],
  destinazione: DestinazioneSpostamento,
): Promise<EsitoAllineamento> {
  if (interventoIds.length === 0) return NIENTE;

  const voci: VoceDaSpostamento[] = [];
  for (let i = 0; i < interventoIds.length; i += 200) {
    const { data, error } = await db
      .from('rapportino_voci')
      .select('id, rapportino_id, risposte, rapportini!inner(staff_id, data, stato)')
      .in('intervento_id', interventoIds.slice(i, i + 200));
    if (error) {
      console.error('[acea/spostamento] voci di provenienza non lette:', error.message);
      return NIENTE;
    }
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      // PostgREST rende l'embed come oggetto o come array a seconda della cardinalità dedotta:
      // si normalizza qui invece di fidarsi della forma.
      const rap = (Array.isArray(r.rapportini) ? r.rapportini[0] : r.rapportini) as
        { staff_id?: string | null; data?: string | null; stato?: string | null } | null;
      if (!rap) continue;
      voci.push({
        id: String(r.id),
        rapportino_id: String(r.rapportino_id),
        staff_id: String(rap.staff_id ?? ''),
        data: String(rap.data ?? ''),
        stato: rap.stato ?? null,
        risposte: (r.risposte as Record<string, unknown> | null) ?? null,
      });
    }
  }

  const { daRimuovere, daConservare } = vociDaSpostamento(voci, destinazione);
  let rimosse = 0;
  for (let i = 0; i < daRimuovere.length; i += 200) {
    const blocco = daRimuovere.slice(i, i + 200);
    const { error } = await db.from('rapportino_voci').delete().in('id', blocco);
    if (error) {
      console.error('[acea/spostamento] voci di provenienza non rimosse:', error.message);
      break;
    }
    rimosse += blocco.length;
  }

  return { rimosse, avviso: avvisoVociConservate(daConservare) };
}

/** Un intervento spostato, con la destinazione che gli è toccata. */
export type Spostamento = { interventoId: string } & DestinazioneSpostamento;

/**
 * Come sopra, ma per un incolla di celle: ogni riga può finire su un operatore e un giorno
 * SUOI, quindi si raggruppa per destinazione e si fa una passata per gruppo — la regola
 * confronta la voce con la destinazione del PROPRIO intervento, e una destinazione sola per
 * tutto il lotto rimuoverebbe le voci giuste dei vicini.
 */
export async function allineaVociSpostateMulti(
  db: SupabaseClient,
  spostamenti: readonly Spostamento[],
): Promise<EsitoAllineamento> {
  if (spostamenti.length === 0) return NIENTE;
  const perDestinazione = new Map<string, { dest: DestinazioneSpostamento; ids: string[] }>();
  for (const s of spostamenti) {
    const k = `${s.staffId}|${s.data}`;
    const g = perDestinazione.get(k) ?? { dest: { staffId: s.staffId, data: s.data }, ids: [] };
    g.ids.push(s.interventoId);
    perDestinazione.set(k, g);
  }
  let rimosse = 0;
  const avvisi: string[] = [];
  for (const { dest, ids } of perDestinazione.values()) {
    const esito = await allineaVociSpostate(db, ids, dest);
    rimosse += esito.rimosse;
    if (esito.avviso) avvisi.push(esito.avviso);
  }
  // Un avviso per destinazione sarebbe illeggibile in un incolla di cinquanta righe: si tiene
  // il primo, che dice già cosa fare, e si conta il resto.
  const avviso = avvisi.length === 0
    ? null
    : avvisi.length === 1
      ? avvisi[0]
      : `${avvisi[0]} (e altri ${avvisi.length - 1} casi simili in questo incolla)`;
  return { rimosse, avviso };
}
