// Pianificazione pura degli interventi di un piano (Mappa Operatori → tabella interventi).
// Nessun I/O. L'I/O sta in ensureInterventiForPiano.ts.
import { taskToIntervento, type InterventoDaMappa } from './taskToIntervento';
import { normOdl } from './odlPositivi';
import type { Task } from '@/utils/routing/types';
import { chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

export type PianoMeta = { data: string };
export type OperatorePiano = { staff_id: string; tasks: Task[] | null };
export type InterventoEsistente = {
  id: string;
  odl: string | null;
  stato: string;
  matricola_contatore?: string | null;
  indirizzo?: string | null;
  intervento_tipo?: string | null;
};

export type PianoPlanInput = {
  committente?: string;
  piano: PianoMeta;
  pianoId: string;
  operatori: OperatorePiano[];
  esistenti: InterventoEsistente[];
  territorioId: string | null;
  /** odl già presenti in `interventi` su ALTRI piani della stessa data (indice unico globale). */
  odlGiaPresenti?: Set<string>;
  /** Indice tassonomia (Task 2) per la derivazione soft di intervento_tipo canonico + gruppo_attivita. */
  indiceTassonomia?: Map<string, TassonomiaRiga>;
  /**
   * odl (normalizzati con normOdl) che hanno GIÀ un esito positivo altrove (altra data /
   * altro piano): un ODL positivo è definitivamente chiuso e non va mai ripianificato.
   * Vedi lib/interventi/odlPositivi.ts.
   */
  odlGiaPositivi?: ReadonlySet<string>;
};

export type PianoPlan = {
  idDaEliminare: string[];
  daInserire: InterventoDaMappa[];
  /** odl dei task scartati perché già eseguiti positivi altrove. */
  odlBloccati: string[];
};

/**
 * Identità robusta di un intervento per il dedup in rigenerazione.
 * ODL se presente; altrimenti (ACEA ha spesso ODL null) identità composta
 * indirizzo+matricola(+attività). Serve a NON ricreare/duplicare un intervento
 * già presente quando si rigenera dai task del piano.
 */
export function identitaIntervento(r: {
  odl: string | null;
  matricola_contatore?: string | null;
  indirizzo?: string | null;
  intervento_tipo?: string | null;
}): string | null {
  const odl = (r.odl ?? '').trim().toLowerCase();
  if (odl) return `odl:${odl}`;
  const matr = (r.matricola_contatore ?? '').trim().toLowerCase();
  const ind = (r.indirizzo ?? '').trim().toLowerCase();
  // Tipo normalizzato come la tassonomia (upper, spazi collassati, senza accenti): una riga
  // terminale scritta con la variante grezza (giro senza tassonomia) deve matchare il rec
  // fresco canonicalizzato, altrimenti il guard dei terminali non scatta e si duplica.
  // Chiave solo in-memory (client+server usano QUESTA stessa funzione): cambiarla è sicuro.
  const tipo = chiaveTassonomia(r.intervento_tipo);
  if (matr || ind) return `c:${matr}|${ind}|${tipo}`;
  return null;
}

/**
 * Id degli interventi canonici da cancellare per un'azione ESPLICITA di "Elimina" in
 * pianificazione: tra gli esistenti, solo gli ANNULLATI la cui identità è tra le chiavi
 * inviate dall'utente. Separato da `planInterventi` per NON intaccare l'invariante
 * "in rigenerazione gli annullati non si cancellano mai".
 */
export function idAnnullatiDaEliminare(
  esistenti: InterventoEsistente[],
  chiaviEliminate: Set<string>,
): string[] {
  return esistenti
    .filter((e) => e.stato === 'annullato')
    .filter((e) => {
      const k = identitaIntervento(e);
      return k != null && chiaviEliminate.has(k);
    })
    .map((e) => e.id);
}

export function planInterventi(input: PianoPlanInput): PianoPlan {
  const committente = input.committente ?? 'acea';
  // Preserva gli stati TERMINALI: 'completato' (esito reale) e 'annullato'. Gli annullati
  // possono essere esiti reali (es. import ACEA) oppure annullamenti d'ufficio: in entrambi i
  // casi NON vanno cancellati/ricreati da ensureInterventiForPiano (rigenera-giorno deve
  // mantenerli — vedi suo commento). La reversibilità dell'annullamento d'ufficio vive sul flag
  // della VOCE del rapportino (_annullato), non sullo stato dell'intervento.
  const isTerminale = (stato: string) => stato === 'completato' || stato === 'annullato';

  // Identità degli interventi GIÀ TERMINALI (completati): sono preservati,
  // quindi i task corrispondenti NON vanno re-inseriti (sennò si duplicano — caso
  // ACEA con ODL null, dove il dedup per solo ODL non bastava).
  const keyTerminali = new Set(
    input.esistenti.filter((e) => isTerminale(e.stato)).map(identitaIntervento).filter((x): x is string => !!x),
  );
  const idDaEliminare = input.esistenti.filter((e) => !isTerminale(e.stato)).map((e) => e.id);

  const odlGiaPresenti = input.odlGiaPresenti ?? new Set<string>();
  const odlGiaPositivi = input.odlGiaPositivi ?? new Set<string>();
  const visti = new Set<string>();
  const daInserire: InterventoDaMappa[] = [];
  const odlBloccati: string[] = [];

  for (const op of input.operatori) {
    for (const t of op.tasks ?? []) {
      const rec = taskToIntervento(
        t,
        {
          committente,
          data: input.piano.data,
          staffId: op.staff_id,
          pianoId: input.pianoId,
          territorioId: input.territorioId,
        },
        input.indiceTassonomia,
      );
      // Già chiuso (per ODL o per identità composta indirizzo+matricola) → preserva, non duplicare.
      const key = identitaIntervento(rec);
      if (key && keyTerminali.has(key)) continue;
      if (rec.odl) {
        // ODL già eseguito positivo altrove: definitivamente chiuso, non si ripianifica.
        if (odlGiaPositivi.has(normOdl(rec.odl))) { odlBloccati.push(rec.odl); continue; }
        if (odlGiaPresenti.has(rec.odl)) continue; // esiste su altro piano stessa data
        if (visti.has(rec.odl)) continue; // dedup interno al batch
        visti.add(rec.odl);
      }
      daInserire.push(rec);
    }
  }

  return { idDaEliminare, daInserire, odlBloccati };
}
