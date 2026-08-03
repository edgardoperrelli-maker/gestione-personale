// Pianificazione pura degli interventi di un piano (Mappa Operatori → tabella interventi).
// Nessun I/O. L'I/O sta in ensureInterventiForPiano.ts.
import { taskToIntervento, type InterventoDaMappa } from './taskToIntervento';
import { normOdl } from './odlPositivi';
import type { Task } from '@/utils/routing/types';
import { chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { allineaAttivitaQualsiasi } from '@/lib/attivita/aliasAttivita';

export type PianoMeta = { data: string };
export type OperatorePiano = { staff_id: string; tasks: Task[] | null };
export type InterventoEsistente = {
  id: string;
  odl: string | null;
  stato: string;
  matricola_contatore?: string | null;
  indirizzo?: string | null;
  intervento_tipo?: string | null;
  committente?: string | null;
  /**
   * `false` = riga che la mappa NON ha creato (inserimento manuale, import): non si rigenera
   * mai, ma occupa comunque la sua chiave nell'indice unico del database. Assente = trattata
   * come creata dalla mappa (comportamento storico dei chiamanti che non la passano).
   */
  created_from_mappa?: boolean;
};

export type PianoPlanInput = {
  committente?: string;
  piano: PianoMeta;
  pianoId: string;
  operatori: OperatorePiano[];
  esistenti: InterventoEsistente[];
  territorioId: string | null;
  /** Mappa nome normalizzato → id dei territori master, per il territorio ESPLICITO
   *  dei task manuali (task.territorio). Assente → sempre territorioId del piano. */
  territorioIdByName?: Map<string, string>;
  /**
   * Chiavi di unicità (vedi `chiaveUnicita`) già presenti in `interventi` su ALTRE righe della
   * stessa data: rispecchia gli indici unici del database.
   */
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
  // Tipo normalizzato come la tassonomia (upper, spazi collassati, senza accenti) E collassato con
  // l'alias COMPLETO (incluso ATLAS bare↔lungo): due forme dello stesso lavoro (es. "LIMITAZIONE
  // MASSIVA" vs "LIMITAZIONI MASSIVE", o "DIS00N" vs "DIS00N - DISATTIVAZIONE…") devono dare la STESSA
  // identità, altrimenti il guard dei terminali non scatta e si duplica/risorge in rigenerazione.
  // Committente-agnostico (qui il committente non c'è; le varianti sono univoche tra committenti) e
  // chiave solo in-memory (mai persistita): collassare qui è sicuro anche per gli ATLAS.
  const tipo = allineaAttivitaQualsiasi(chiaveTassonomia(r.intervento_tipo));
  if (matr || ind) return `c:${matr}|${ind}|${tipo}`;
  return null;
}

/**
 * Chiave di unicità di un intervento a parità di giornata, calcata sugli indici del database:
 *   • `interventi_dedup_idx`             → (committente, odl, data)              committente ≠ acqualatina
 *   • `interventi_dedup_acqualatina_idx` → (committente, odl, data, matricola)   committente = acqualatina
 *
 * Su ACQUA LATINA un ODL può coprire PIÙ misuratori — è la ragione per cui quell'indice
 * esiste separato — quindi la matricola fa parte dell'identità: ignorarla scarterebbe come
 * doppione del lavoro legittimo. `data` non entra: qui si ragiona sempre a parità di giorno.
 *
 * Tenere questa chiave allineata agli indici è ciò che impedisce i due errori opposti:
 * scartare lavoro vero, e tentare un insert che viola l'unicità facendo fallire il salvataggio.
 */
export function chiaveUnicita(r: {
  committente?: string | null;
  odl?: string | null;
  matricola_contatore?: string | null;
}): string | null {
  const odl = (r.odl ?? '').trim();
  if (!odl) return null;
  const committente = (r.committente ?? '').trim().toLowerCase();
  return committente === 'acqualatina'
    ? `${committente}|${odl}|${(r.matricola_contatore ?? '').trim()}`
    : `${committente}|${odl}`;
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
  // Committente BASE del piano: ogni task può poi derivare il SUO committente reale
  // dalla tassonomia (vedi taskToIntervento) — i giri misti producono interventi misti.
  const committente = input.committente ?? 'acea';
  // Preserva gli stati TERMINALI: 'completato' (esito reale) e 'annullato'. Gli annullati
  // possono essere esiti reali (es. import ACEA) oppure annullamenti d'ufficio: in entrambi i
  // casi NON vanno cancellati/ricreati da ensureInterventiForPiano (rigenera-giorno deve
  // mantenerli — vedi suo commento). La reversibilità dell'annullamento d'ufficio vive sul flag
  // della VOCE del rapportino (_annullato), non sullo stato dell'intervento.
  const isTerminale = (stato: string) => stato === 'completato' || stato === 'annullato';

  // Si rigenera SOLO ciò che ha creato la mappa: le righe manuali e di import non si toccano.
  const rigenerabili = input.esistenti.filter((e) => e.created_from_mappa !== false);
  const idDaEliminare = rigenerabili.filter((e) => !isTerminale(e.stato)).map((e) => e.id);

  // Chi resta in piedi dopo la cancellazione: i terminali rigenerabili E tutte le righe che la
  // mappa non ha creato. Le loro chiavi sono OCCUPATE — reinserirle viola l'indice unico e fa
  // fallire l'intero salvataggio del piano, non solo il singolo task. Le non-mappa mancavano:
  // erano invisibili qui (il chiamante filtrava su created_from_mappa) ma non al database.
  const sopravvissuti = input.esistenti.filter((e) => e.created_from_mappa === false || isTerminale(e.stato));
  const chiaviOccupate = new Set(
    sopravvissuti
      .map((e) => chiaveUnicita({ ...e, committente: e.committente ?? committente }))
      .filter((x): x is string => !!x),
  );
  // Identità composta (indirizzo+matricola+tipo): copre i committenti che arrivano SENZA ODL
  // (ACEA), dove il confronto per ODL non ha appiglio. Con l'ODL comanda `chiaviOccupate`,
  // che distingue le matricole dove il database le distingue.
  const keyComposte = new Set(
    sopravvissuti
      .filter((e) => !(e.odl ?? '').trim())
      .map(identitaIntervento)
      .filter((x): x is string => !!x),
  );

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
          territorioIdByName: input.territorioIdByName,
        },
        input.indiceTassonomia,
      );
      // Senza ODL (ACEA): l'unico appiglio è l'identità composta indirizzo+matricola+tipo.
      const key = identitaIntervento(rec);
      if (key && keyComposte.has(key)) continue;
      const chiave = chiaveUnicita(rec);
      // Prima di tutto: se la riga è già in QUESTO piano e sopravvive alla rigenerazione, il
      // task è già servito. Va prima del blocco sui positivi, altrimenti un terminale di questo
      // stesso piano verrebbe segnalato come «già positivo altrove» — che altrove non è.
      if (chiave && chiaviOccupate.has(chiave)) continue;
      if (chiave && rec.odl) {
        // ODL già eseguito positivo altrove: definitivamente chiuso, non si ripianifica.
        if (odlGiaPositivi.has(normOdl(rec.odl))) { odlBloccati.push(rec.odl); continue; }
        if (odlGiaPresenti.has(chiave)) continue;  // esiste su altra riga della stessa data
        if (visti.has(chiave)) continue;           // dedup interno al batch
        visti.add(chiave);
      }
      daInserire.push(rec);
    }
  }

  return { idDaEliminare, daInserire, odlBloccati };
}
