// PURA: costruisce la riga rapportino_voci per una richiesta manuale.
// La colonna ODL della tabella voci si chiama `odl` (migrazione 20260604000000_unifica_ods_odl).
// La coordinata committente va nel raw_json (coerente con coordinateFromRaw). _nuovo=true → badge "Nuovo".
import type { DatiInterventoManuale } from './types';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type VoceManualeInsert = {
  rapportino_id: string;
  richiesta_id: string;
  ordine: number;
  manuale: true;
  /**
   * DEVE essere scritta: `rapportino_voci.origine` ha default 'task', e `sincronizzaRapportini`
   * cancella tutte le voci 'task' per rigenerarle dai task del piano. Una voce del «+» lasciata
   * al default viene quindi rasa via alla prima rigenerazione e NON ricreata (non è un task del
   * piano): il lavoro dell'operatore sparisce senza un errore. È esattamente ciò che è successo
   * fra il 27/07 — quando la colonna è nata (20260727091000) e il motore è passato da
   * `manuale=false` a `origine='task'` — e il 03/08.
   */
  origine: 'manuale';
  approvazione_stato: 'in_attesa';
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odl: string | null;
  via: string | null;
  comune: string | null;
  cap: string | null;
  recapito: string | null;
  attivita: string | null;
  accessibilita: string | null;
  fascia_oraria: string | null;
  raw_json: Record<string, unknown>;
  risposte: Record<string, unknown>;
  /**
   * Flusso del GRUPPO ATTIVITÀ della voce (Azioni operatori), se il chiamante l'ha risolto.
   * NULL = nessun flusso dedicato trovato: la voce eredita — via `campiDiVoce` — lo snapshot del
   * rapportino, come sempre. Senza questo, ogni voce dal "+" ripiegava SEMPRE sul modulo del
   * rapportino padre: innocuo quando lo stesso committente lo governa, sbagliato quando la voce
   * appartiene a un gruppo con un flusso proprio dentro un rapportino di un ALTRO committente
   * (es. un "+" BONIFICHE EXTRA sotto un rapportino AcquaLatina ereditava la matricola nuova del
   * misuratore AcquaLatina come obbligatoria).
   */
  template_id: string | null;
  campi_snapshot: TemplateCampo[] | null;
};

const v = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

/** Colonne anagrafica + risposte di una voce, derivate dai dati dell'intervento manuale. */
export type ColonneAnagraficaVoce = Pick<
  VoceManualeInsert,
  'nominativo' | 'matricola' | 'pdr' | 'odl' | 'via' | 'comune' | 'cap' | 'recapito' | 'attivita' | 'accessibilita' | 'fascia_oraria' | 'risposte'
>;

/**
 * PURA: mappa anagrafica + risposte dei dati intervento sulle colonne di `rapportino_voci`.
 * Usata sia alla creazione del "+" (buildVoceManuale) sia in APPROVAZIONE: il backoffice può
 * correggere/aggiungere dati (es. la PDR, o la matricola) nel modulo approvazioni → quei dati
 * vivono in `interventi_manuali.dati_correnti`; vanno riportati sulla voce del rapportino, altrimenti
 * il rapportino/PDF mostra il dato vecchio dell'operatore (PDR mancante, matricola non corretta).
 */
export function colonneAnagraficaVoce(dati: DatiInterventoManuale): ColonneAnagraficaVoce {
  const a = dati.anagrafica;
  return {
    nominativo: v(a.nominativo),
    matricola: v(a.matricola),
    pdr: v(a.pdr),
    odl: v(a.odl),
    via: v(a.via),
    comune: v(a.comune),
    cap: v(a.cap),
    recapito: v(a.recapito),
    attivita: v(a.attivita),
    accessibilita: v(a.accessibilita),
    fascia_oraria: v(a.fascia_oraria),
    risposte: dati.risposte ?? {},
  };
}

export function buildVoceManuale(args: {
  rapportinoId: string;
  richiestaId: string;
  ordine: number;
  dati: DatiInterventoManuale;
  /** Id del template del flusso risolto per il (committente, gruppo attività) della voce. */
  templateId?: string | null;
  /** Campi dello stesso flusso, da congelare sulla voce. NULL/assente = nessun flusso risolto. */
  campi?: TemplateCampo[] | null;
}): VoceManualeInsert {
  const a = args.dati.anagrafica;
  const raw_json: Record<string, unknown> = { _nuovo: true };
  if (v(a.coordinate)) raw_json.coordinate = v(a.coordinate);
  return {
    rapportino_id: args.rapportinoId,
    richiesta_id: args.richiestaId,
    ordine: args.ordine,
    manuale: true,
    origine: 'manuale',
    approvazione_stato: 'in_attesa',
    ...colonneAnagraficaVoce(args.dati),
    raw_json,
    template_id: args.templateId ?? null,
    campi_snapshot: args.campi && args.campi.length > 0 ? args.campi : null,
  };
}
