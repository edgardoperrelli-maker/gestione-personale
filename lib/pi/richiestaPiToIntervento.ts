// PURA: dai dati correnti di una richiesta P.I. approvata costruisce il record per
// la tabella canonica `interventi`. Speculare a richiestaToIntervento.ts ma con
// origine='pronto_intervento', committente='altro' (niente CHECK da allargare).
import type { DatiInterventoManuale } from '@/lib/interventi/manuali/types';

/** Chiavi standard dei campi P.I. (allineate al template seed e alla UI). */
export const CHIAVI_PI = {
  indirizzo: 'via', // info_campi
  comune: 'comune', // info_campi
  nSegnalazione: 'n_segnalazione', // risposta (testo)
  oraInizio: 'ora_inizio', // risposta (ora)
  oraFine: 'ora_fine', // risposta (ora)
  assistenteTe: 'assistente_te', // risposta (select)
  note: 'note', // risposta (testo)
} as const;

export type ContextPi = {
  data: string;
  staff_id: string;
};

export type InterventoPiRecord = {
  committente: 'altro';
  odl: null;
  pdr: null;
  nominativo: null;
  indirizzo: string | null;
  comune: string | null;
  cap: null;
  intervento_tipo: 'PRONTO INTERVENTO';
  rif_esterno: string | null; // N° segnalazione
  data: string;
  staff_id: string;
  stato: 'completato';
  esito: 'eseguito_positivo';
  origine: 'pronto_intervento';
  created_from_mappa: false;
};

const trimOrNull = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

export function richiestaPiToIntervento(
  dati: DatiInterventoManuale,
  ctx: ContextPi,
): InterventoPiRecord {
  const a = dati.anagrafica ?? {};
  const r = dati.risposte ?? {};
  return {
    committente: 'altro',
    odl: null,
    pdr: null,
    nominativo: null,
    indirizzo: trimOrNull(a[CHIAVI_PI.indirizzo]),
    comune: trimOrNull(a[CHIAVI_PI.comune]),
    cap: null,
    intervento_tipo: 'PRONTO INTERVENTO',
    rif_esterno: trimOrNull(r[CHIAVI_PI.nSegnalazione]),
    data: ctx.data,
    staff_id: ctx.staff_id,
    stato: 'completato',
    esito: 'eseguito_positivo',
    origine: 'pronto_intervento',
    created_from_mappa: false,
  };
}
