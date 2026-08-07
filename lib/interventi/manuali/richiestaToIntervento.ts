// PURA: dai dati correnti di una richiesta manuale approvata, costruisce il record
// per la tabella canonica `interventi`. Speculare a lib/interventi/taskToIntervento.ts,
// ma origine='manuale' e created_from_mappa=false. L'I/O (insert) sta nella route.
import type { CommittenteManuale, DatiInterventoManuale } from './types';
import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { maiuscolo } from '@/lib/testo/maiuscolo';

export type ContextInterventoManuale = {
  committente: CommittenteManuale;
  data: string;
  staff_id: string;
  piano_id?: string | null;
  territorio_id?: string | null;
  /**
   * Il "+" è stato creato sotto un task-via (voce contenitore BONIFICHE EXTRA). Regola di
   * business: gli interventi fatti sulla via-contenitore vanno SEMPRE associati al committente
   * Italgas e al gruppo attività BONIFICHE EXTRA, a prescindere dall'attività digitata.
   */
  taskViaParent?: boolean;
  /**
   * L'intervento nasce ASSEGNATO invece che completato: il lavoro non è ancora stato fatto.
   *
   * Vale per il flusso AcquaLatina, dove l'approvazione dell'ufficio **è** l'assegnazione —
   * l'operatore è sul posto e aspetta di poter iniziare. Chiuderlo come «completato ed
   * eseguito positivo» al momento dell'approvazione direbbe una cosa falsa per tutto il tempo
   * fra l'assegnazione e la compilazione: entrerebbe in Storico e nei KPI come lavoro fatto,
   * e l'anti-duplicato lo tratterebbe da esito positivo.
   *
   * Ci pensa `invia` a chiuderlo con l'esito vero letto dal rapportino, come per qualunque
   * intervento pianificato.
   */
  daAssegnare?: boolean;
};

export type InterventoManualeRecord = {
  committente: string;
  odl: string | null;
  pdr: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  lat: number | null;
  lng: number | null;
  fascia_oraria: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  gruppo_attivita: string | null;
  data: string;
  staff_id: string;
  stato: 'completato' | 'assegnato';
  esito: 'eseguito_positivo' | null;
  assegnato_at: string | null;
  piano_id: string | null;
  territorio_id: string | null;
  origine: 'manuale';
  created_from_mappa: false;
};

/**
 * Trim + MAIUSCOLO: è la garanzia lato server della regola «dati sempre in MAIUSCOLO»
 * (docs/superpowers/specs/2026-06-25-dati-maiuscolo-design.md).
 *
 * Il maiuscolo qui NON è un doppione di quello che fa il client mentre si digita: la spec lo
 * mette su due livelli apposta, e questo è il secondo — quello che copre la coda offline
 * ri-giocata e i client non aggiornati. Fino a oggi questa funzione si fermava al trim, e infatti
 * il primo livello da solo non ha tenuto: su 2.802 interventi manuali erano rimasti minuscoli
 * 329 `comune` e 335 `indirizzo`, mentre nominativo, matricola, ODL e PDR — che passano dagli
 * stessi campi ma non dallo stesso widget — erano puliti al 100%.
 *
 * Il prezzo di quei 329: le schede e i filtri del registro confrontano il comune con un uguale
 * secco su un valore che `lib/acea/comuniMassive.ts` produce già maiuscolo, quindi filtrare i
 * «Chiusi» per ZAGAROLO ne perdeva 250 senza dirlo. Una maiuscola di differenza, righe che
 * spariscono da un elenco con un conteggio che torna.
 *
 * `maiuscolo` e non `.toUpperCase()` diretto: la regola ha una sola implementazione, ed è quella.
 * Tutti i campi che passano di qui sono anagrafica e codici — l'ambito esatto della spec; i
 * campi tecnici (id, token, percorsi foto) non arrivano a questa funzione.
 */
const normalizza = (v: string | null | undefined): string | null => {
  const s = maiuscolo((v ?? '').trim());
  return s === '' ? null : s;
};

/**
 * Trim e basta, per il solo `intervento_tipo`.
 *
 * Non è una dimenticanza: quello NON è anagrafica, è una CLASSIFICAZIONE. La forma canonica gliela
 * dà la tassonomia (`risolviGruppo` → `ris.descrizione`), e questa riga è solo il ripiego per la
 * coda offline che porta un'attività che la tassonomia non risolve. Maiuscolarla qui
 * inventerebbe una TERZA forma della stessa attività — accanto a quella digitata e a quella
 * canonica — cioè esattamente il difetto che `normalizza` esiste per chiudere.
 *
 * Restano 249 interventi manuali con `intervento_tipo` in forma mista: vanno riconciliati con la
 * tassonomia, non maiuscolati, ed è un lavoro a sé.
 */
const soloTrim = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

/** Parsa "lat, lng" → [lat, lng] numerici, altrimenti [null, null]. */
function parseCoord(raw: string | null | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const m = raw.split(',').map((p) => Number(p.trim()));
  if (m.length !== 2 || !Number.isFinite(m[0]) || !Number.isFinite(m[1])) return [null, null];
  return [m[0], m[1]];
}

export function richiestaToIntervento(
  dati: DatiInterventoManuale,
  ctx: ContextInterventoManuale,
  indice?: Map<string, TassonomiaRiga>,
): InterventoManualeRecord {
  const a = dati.anagrafica;
  const [lat, lng] = parseCoord(a.coordinate);
  // Classificazione: sotto un task-via l'intervento è SEMPRE Italgas + BONIFICHE EXTRA (regola di
  // business). Altrimenti: descrizione canonica + gruppo se l'attività risolve in tassonomia,
  // sennò il testo grezzo (retro-compat coda offline) con gruppo null.
  const classificazione = ctx.taskViaParent
    ? { committente: 'italgas', intervento_tipo: 'BONIFICHE EXTRA', gruppo_attivita: 'BONIFICHE EXTRA' }
    : (() => {
        const ris = indice ? risolviGruppo(ctx.committente, a.attivita, indice, { allinea: 'scrittura' }) : null;
        return {
          committente: ctx.committente as string,
          intervento_tipo: ris ? ris.descrizione : soloTrim(a.attivita),
          gruppo_attivita: ris ? ris.gruppo : null,
        };
      })();
  return {
    committente: classificazione.committente,
    odl: normalizza(a.odl),
    pdr: normalizza(a.pdr),
    nominativo: normalizza(a.nominativo),
    indirizzo: normalizza(a.via),
    comune: normalizza(a.comune),
    cap: normalizza(a.cap),
    lat,
    lng,
    fascia_oraria: normalizza(a.fascia_oraria),
    matricola_contatore: normalizza(a.matricola),
    intervento_tipo: classificazione.intervento_tipo,
    gruppo_attivita: classificazione.gruppo_attivita,
    data: ctx.data,
    staff_id: ctx.staff_id,
    // Assegnato = il lavoro deve ancora essere fatto; lo chiude `invia` con l'esito vero.
    stato: ctx.daAssegnare ? 'assegnato' : 'completato',
    esito: ctx.daAssegnare ? null : 'eseguito_positivo',
    assegnato_at: ctx.daAssegnare ? new Date().toISOString() : null,
    piano_id: ctx.piano_id ?? null,
    territorio_id: ctx.territorio_id ?? null,
    origine: 'manuale',
    created_from_mappa: false,
  };
}
