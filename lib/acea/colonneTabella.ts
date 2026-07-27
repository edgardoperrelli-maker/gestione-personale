// lib/acea/colonneTabella.ts
// PURA: definizione delle colonne della tabella ordini e formattazione dei valori.
//
// Le colonne sono quelle del master più la scadenza, come concordato: si guarda la stessa cosa
// che si guardava nel foglio, senza il foglio. Il resto dei ~50 campi del registro resta
// disponibile come colonna attivabile, non a schermo di default.

export type RigaTabella = {
  odl: string;
  numero_operazione: string;
  famiglia: string;
  tipo_ordine: string | null;
  attivita: string | null;
  stato: string;
  stato_desc: string | null;
  aperto: boolean;
  data_creazione: string;
  cardine_al: string | null;
  scadenza: string | null;
  data_completamento: string | null;
  operatore_cognome: string | null;
  causale: string | null;
  causale_desc: string | null;
  esito_positivo: boolean | null;
  via: string | null;
  civico: string | null;
  comune: string | null;
  impianto: string | null;
  matricola: string | null;
  valore_netto: number | null;
  escludi_consuntivazione: boolean;
  codice_sla: string | null;
  priorita_testo: string | null;
  centro_lavoro: string | null;
  sospetto_troncamento: boolean;
  // dalla pianificazione (join in lettura, non è dato ACEA)
  pianificato_il: string | null;
  pianificato_a: string | null;
  stato_intervento: string | null;
};

export type ChiaveColonna =
  | 'odl' | 'attivita' | 'matricola' | 'indirizzo' | 'comune' | 'stato'
  | 'data_creazione' | 'scadenza' | 'pianificato_a' | 'pianificato_il'
  | 'impianto' | 'famiglia' | 'tipo_ordine' | 'operatore_cognome' | 'esito'
  | 'valore_netto' | 'codice_sla' | 'priorita_testo' | 'centro_lavoro' | 'cardine_al';

export type DefColonna = {
  chiave: ChiaveColonna;
  intestazione: string;
  /** Visibile di default: la vista «come il master». */
  predefinita: boolean;
  /** Allineamento numerico/monospazio per i dati tabellari. */
  mono?: boolean;
  larghezza: number;
};

/** Colonne della vista Dunning (pianificazione). */
export const COLONNE_DUNNING: DefColonna[] = [
  { chiave: 'odl', intestazione: 'ODL', predefinita: true, mono: true, larghezza: 110 },
  { chiave: 'attivita', intestazione: 'Attività', predefinita: true, larghezza: 210 },
  { chiave: 'matricola', intestazione: 'Matricola', predefinita: true, mono: true, larghezza: 130 },
  { chiave: 'indirizzo', intestazione: 'Indirizzo', predefinita: true, larghezza: 220 },
  { chiave: 'comune', intestazione: 'Comune', predefinita: true, larghezza: 140 },
  { chiave: 'stato', intestazione: 'Stato ordine', predefinita: true, larghezza: 130 },
  { chiave: 'data_creazione', intestazione: 'Creazione', predefinita: true, mono: true, larghezza: 100 },
  { chiave: 'scadenza', intestazione: 'Scadenza', predefinita: true, mono: true, larghezza: 130 },
  { chiave: 'pianificato_a', intestazione: 'Esecutore', predefinita: true, larghezza: 140 },
  { chiave: 'pianificato_il', intestazione: 'Data pianificata', predefinita: true, mono: true, larghezza: 120 },
  // attivabili
  { chiave: 'impianto', intestazione: 'Impianto', predefinita: false, mono: true, larghezza: 120 },
  { chiave: 'famiglia', intestazione: 'Famiglia', predefinita: false, larghezza: 100 },
  { chiave: 'tipo_ordine', intestazione: 'Tipo ordine', predefinita: false, mono: true, larghezza: 100 },
  { chiave: 'operatore_cognome', intestazione: 'Operatore ACEA', predefinita: false, larghezza: 140 },
  { chiave: 'esito', intestazione: 'Esito ACEA', predefinita: false, larghezza: 200 },
  { chiave: 'valore_netto', intestazione: 'Valore', predefinita: false, mono: true, larghezza: 90 },
  { chiave: 'codice_sla', intestazione: 'SLA', predefinita: false, mono: true, larghezza: 80 },
  { chiave: 'priorita_testo', intestazione: 'Priorità', predefinita: false, larghezza: 140 },
  { chiave: 'centro_lavoro', intestazione: 'Centro di lavoro', predefinita: false, mono: true, larghezza: 130 },
  { chiave: 'cardine_al', intestazione: 'Scadenza ACEA', predefinita: false, mono: true, larghezza: 120 },
];

/** Colonne della vista Limitazioni massive: nessuna scadenza, questi ordini non scadono. */
export const COLONNE_MASSIVE: DefColonna[] = [
  { chiave: 'odl', intestazione: 'ODL', predefinita: true, mono: true, larghezza: 110 },
  { chiave: 'impianto', intestazione: 'Impianto', predefinita: true, mono: true, larghezza: 120 },
  { chiave: 'matricola', intestazione: 'Matricola', predefinita: true, mono: true, larghezza: 140 },
  { chiave: 'indirizzo', intestazione: 'Indirizzo', predefinita: true, larghezza: 220 },
  { chiave: 'comune', intestazione: 'Comune', predefinita: true, larghezza: 130 },
  { chiave: 'stato', intestazione: 'Stato ordine', predefinita: true, larghezza: 130 },
  { chiave: 'pianificato_a', intestazione: 'Esecutore', predefinita: true, larghezza: 140 },
  { chiave: 'pianificato_il', intestazione: 'Data esecuzione', predefinita: true, mono: true, larghezza: 120 },
  { chiave: 'esito', intestazione: 'Esito', predefinita: true, larghezza: 200 },
  { chiave: 'attivita', intestazione: 'Attività', predefinita: false, larghezza: 210 },
  { chiave: 'valore_netto', intestazione: 'Valore', predefinita: false, mono: true, larghezza: 90 },
  { chiave: 'data_creazione', intestazione: 'Creazione', predefinita: false, mono: true, larghezza: 100 },
];

/** 'YYYY-MM-DD' → 'dd/MM/yyyy' (convenzione di casa per il display). */
export function dataIt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Valore di una cella come testo, per rendering ed export. */
export function valoreCella(r: RigaTabella, c: ChiaveColonna): string {
  switch (c) {
    case 'odl':
      // L'operazione si mostra solo quando serve distinguere: sui pochi ordini a più operazioni.
      return r.numero_operazione && r.numero_operazione !== '0010'
        ? `${r.odl}/${r.numero_operazione}`
        : r.odl;
    case 'indirizzo':
      return [r.via, r.civico].filter(Boolean).join(' ') || '—';
    case 'stato':
      return r.stato_desc ?? r.stato;
    case 'esito': {
      if (r.esito_positivo === null) return '—';
      return r.causale_desc ?? r.causale ?? (r.esito_positivo ? 'Eseguito' : 'Non eseguito');
    }
    case 'valore_netto':
      return r.valore_netto === null ? '—' : r.valore_netto.toFixed(2);
    case 'data_creazione':
      return dataIt(r.data_creazione);
    case 'scadenza':
      return dataIt(r.scadenza);
    case 'cardine_al':
      return dataIt(r.cardine_al);
    case 'pianificato_il':
      return dataIt(r.pianificato_il);
    default: {
      const v = r[c as keyof RigaTabella];
      return v === null || v === undefined || v === '' ? '—' : String(v);
    }
  }
}

export type TonoScadenza = 'scaduto' | 'oggi' | 'vicino' | 'lontano' | 'nessuna';

/**
 * Urgenza della riga, per l'evidenziazione.
 *
 * `scaduto` solo per gli ordini ANCORA APERTI: una riga già completata in ritardo non è un
 * problema da segnalare oggi, e colorarla di rosso renderebbe illeggibile la tabella dello storico.
 */
export function tonoScadenza(r: RigaTabella, oggi: string): TonoScadenza {
  if (!r.scadenza || !r.aperto) return 'nessuna';
  if (r.scadenza < oggi) return 'scaduto';
  if (r.scadenza === oggi) return 'oggi';
  const giorni = Math.round(
    (Date.parse(`${r.scadenza}T00:00:00Z`) - Date.parse(`${oggi}T00:00:00Z`)) / 86_400_000,
  );
  return giorni <= 3 ? 'vicino' : 'lontano';
}
