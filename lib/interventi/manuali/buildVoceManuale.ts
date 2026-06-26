// PURA: costruisce la riga rapportino_voci per una richiesta manuale.
// La colonna ODL della tabella voci si chiama `odl` (migrazione 20260604000000_unifica_ods_odl).
// La coordinata committente va nel raw_json (coerente con coordinateFromRaw). _nuovo=true → badge "Nuovo".
import type { DatiInterventoManuale } from './types';

export type VoceManualeInsert = {
  rapportino_id: string;
  richiesta_id: string;
  ordine: number;
  manuale: true;
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
}): VoceManualeInsert {
  const a = args.dati.anagrafica;
  const raw_json: Record<string, unknown> = { _nuovo: true };
  if (v(a.coordinate)) raw_json.coordinate = v(a.coordinate);
  return {
    rapportino_id: args.rapportinoId,
    richiesta_id: args.richiestaId,
    ordine: args.ordine,
    manuale: true,
    approvazione_stato: 'in_attesa',
    ...colonneAnagraficaVoce(args.dati),
    raw_json,
  };
}
