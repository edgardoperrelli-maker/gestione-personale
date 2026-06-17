/** display_name "COGNOME NOME" (maiuscolo) → solo il cognome (primo token), maiuscolo. */
export function cognomeDaDisplayName(displayName: string | null | undefined): string {
  const s = String(displayName ?? '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0].toUpperCase();
}

/** 'eseguito' se positivo, 'No' se lavorato-ma-non-positivo, null se non lavorato. */
export function esitoFileDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): 'eseguito' | 'No' | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? 'eseguito' : 'No';
}

/** true=positivo, false=lavorato-ma-negativo, null=non lavorato. Booleano gemello di esitoFileDaIntervento. */
export function esitoOkDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): boolean | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? true : false;
}

/** Riga di output dell'endpoint: una limitazione lavorata, già tradotta per il file. */
export type RigaLimMassive = {
  id: string;
  odl: string;
  matricola: string;
  comune: string;
  via: string;
  esecutore: string;
  data_esecuzione: string; // 'YYYY-MM-DD'
  esito: 'eseguito' | 'No' | null;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=non lavorato
  esito_motivo: string | null;
  sigillo: string;
  pdr: string;
  nominativo: string;
  manuale: boolean;
};

/** Riga DB (interventi + staff.display_name + sigillo dalla voce). */
export type RigaDb = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null; // 'YYYY-MM-DD'
  committente: string | null;
  origine: string | null;
  display_name: string | null;
  sigillo: string | null;
  pdr: string | null;
  nominativo: string | null;
};

const t = (v: string | null | undefined): string => String(v ?? '').trim();

export function buildRigaLimMassive(r: RigaDb): RigaLimMassive {
  return {
    id: t(r.id),
    odl: t(r.odl),
    matricola: t(r.matricola_contatore),
    comune: t(r.comune),
    via: t(r.indirizzo),
    esecutore: cognomeDaDisplayName(r.display_name),
    data_esecuzione: t(r.data),
    esito: esitoFileDaIntervento(r.stato, r.esito),
    esitoOk: esitoOkDaIntervento(r.stato, r.esito),
    esito_motivo: t(r.esito_motivo) || null,
    sigillo: t(r.sigillo),
    pdr: t(r.pdr),
    nominativo: t(r.nominativo),
    manuale: r.committente === 'lim_massive' || r.origine === 'manuale',
  };
}
