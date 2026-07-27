// lib/acea/applicaImport.ts
// Esecuzione del piano prodotto da `riconciliaImport`: scritture sul registro + change-log.
//
// Riceve il client Supabase per dependency injection (stesso pattern di
// ensureInterventiForPiano): testabile con un fake in-memory, riusabile fuori da Next.
//
// Ordine delle operazioni, non casuale:
//   1. eliminazioni (ANNL) — prima, così un ODL annullato e ripubblicato con la stessa chiave
//      nello stesso file non verrebbe cancellato subito dopo essere stato inserito;
//   2. inserimenti e aggiornamenti;
//   3. change-log;
//   4. anagrafica impianti.
//
// Le scritture passano dal service role: `acea_ordini` non è scrivibile da `authenticated`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PianoImport } from './riconciliaImport';
import type { RigaOrdineAcea } from './tipi';

/** Quante righe per chiamata: PostgREST regge bene qualche centinaio di record per volta. */
const LOTTO = 500;

export type EsitoApplica = {
  inserite: number;
  aggiornate: number;
  eliminate: number;
  eventi: number;
  impianti: number;
  errore?: string;
};

function aLotti<T>(a: readonly T[], n = LOTTO): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

/** Righe dell'anagrafica impianti ricavate dagli ordini: una per impianto, la prima vince. */
function impiantiDa(righe: readonly RigaOrdineAcea[]) {
  const per = new Map<string, {
    impianto: string; matricola: string | null; matricola_norm: string | null;
    comune: string | null; via_acea: string | null; civico_acea: string | null; cap_acea: string | null;
  }>();
  for (const r of righe) {
    if (!r.impianto || per.has(r.impianto)) continue;
    per.set(r.impianto, {
      impianto: r.impianto,
      matricola: r.matricola,
      matricola_norm: r.matricola_norm,
      comune: r.comune,
      via_acea: r.via,
      civico_acea: r.civico,
      cap_acea: r.cap,
    });
  }
  return [...per.values()];
}

/**
 * Applica il piano. `importId` viene scritto su ogni riga toccata e su ogni evento, così il
 * riepilogo di un import è ricostruibile a posteriori.
 */
export async function applicaImport(
  db: SupabaseClient,
  piano: PianoImport,
  importId: string,
): Promise<EsitoApplica> {
  const esito: EsitoApplica = { inserite: 0, aggiornate: 0, eliminate: 0, eventi: 0, impianti: 0 };

  // 1) ELIMINAZIONI — gli annullati escono dal registro.
  // Una `delete().in()` su chiave composta non è esprimibile in PostgREST: si elimina per ODL
  // filtrando anche il numero operazione, una chiamata per riga. Sono poche decine per import
  // (208 annullati in due mesi sull'export di riferimento).
  for (const k of piano.daEliminare) {
    const { error } = await db.from('acea_ordini').delete()
      .eq('odl', k.odl).eq('numero_operazione', k.numero_operazione);
    if (error) return { ...esito, errore: `eliminazione ${k.odl}/${k.numero_operazione}: ${error.message}` };
    esito.eliminate++;
  }

  // 2) INSERIMENTI
  for (const lotto of aLotti(piano.nuove)) {
    const { error } = await db.from('acea_ordini').insert(lotto.map((r) => ({ ...r, import_id: importId })));
    if (error) return { ...esito, errore: `inserimento: ${error.message}` };
    esito.inserite += lotto.length;
  }

  // 3) AGGIORNAMENTI — uno per riga: l'update di massa su chiave composta non è esprimibile.
  for (const m of piano.modificate) {
    const { error } = await db.from('acea_ordini')
      .update({ ...m.riga, import_id: importId })
      .eq('odl', m.riga.odl).eq('numero_operazione', m.riga.numero_operazione);
    if (error) return { ...esito, errore: `aggiornamento ${m.riga.odl}: ${error.message}` };
    esito.aggiornate++;
  }

  // 4) CHANGE-LOG — una riga per campo realmente cambiato, più creazioni e annullamenti.
  const eventi: Array<Record<string, unknown>> = [];
  for (const r of piano.nuove) {
    eventi.push({
      odl: r.odl, numero_operazione: r.numero_operazione, import_id: importId, tipo: 'creato',
    });
  }
  for (const m of piano.modificate) {
    for (const c of m.cambi) {
      eventi.push({
        odl: m.riga.odl, numero_operazione: m.riga.numero_operazione, import_id: importId,
        tipo: 'modificato', campo: c.campo, valore_prima: c.prima, valore_dopo: c.dopo,
      });
    }
  }
  for (const k of piano.daEliminare) {
    eventi.push({
      odl: k.odl, numero_operazione: k.numero_operazione, import_id: importId, tipo: 'annullato',
    });
  }
  for (const lotto of aLotti(eventi)) {
    const { error } = await db.from('acea_ordini_eventi').insert(lotto);
    // Il change-log è osservabilità: se fallisce non si perde il registro, si perde la storia.
    // Meglio un import completato con un avviso che un import a metà.
    if (error) return { ...esito, errore: `change-log: ${error.message}` };
    esito.eventi += lotto.length;
  }

  // 5) ANAGRAFICA IMPIANTI — solo i campi ACEA; `indirizzo_verificato` e compagnia non si toccano
  // mai da qui (li scrive l'ufficio, ed è l'unica cosa che l'app può scrivere su questa tabella).
  const impianti = impiantiDa([...piano.nuove, ...piano.modificate.map((m) => m.riga)]);
  for (const lotto of aLotti(impianti)) {
    const { error } = await db.from('acea_impianti').upsert(lotto, { onConflict: 'impianto' });
    if (error) return { ...esito, errore: `anagrafica impianti: ${error.message}` };
    esito.impianti += lotto.length;
  }

  return esito;
}
