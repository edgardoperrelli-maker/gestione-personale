// Macchina a stati degli interventi (allineata agli stati OdL Acea).
// Logica pura, testabile senza DB. Spec: docs/superpowers/specs/2026-06-01-interventi-acea-datamodel-design.md

export type StatoIntervento =
  | 'da_assegnare'
  | 'assegnato'
  | 'in_viaggio'
  | 'sul_posto'
  | 'in_esecuzione'
  | 'completato'
  | 'annullato';

export type EsitoIntervento =
  | 'eseguito_positivo'
  | 'accesso_negato'
  | 'contatore_non_trovato'
  | 'dati_ubicazione_insufficienti'
  | 'accesso_a_vuoto'
  | 'rinviato';

// Transizioni ammesse del ciclo di vita. `completato` e `annullato` sono terminali.
const TRANSIZIONI: Record<StatoIntervento, StatoIntervento[]> = {
  da_assegnare: ['assegnato', 'annullato'],
  assegnato: ['in_viaggio', 'da_assegnare', 'annullato'], // riassegnazione: torna a da_assegnare
  in_viaggio: ['sul_posto', 'annullato'],
  sul_posto: ['in_esecuzione', 'annullato'],
  in_esecuzione: ['completato', 'annullato'],
  completato: [],
  annullato: [],
};

export function transizioneValida(da: StatoIntervento, a: StatoIntervento): boolean {
  if (da === a) return false;
  return TRANSIZIONI[da]?.includes(a) ?? false;
}

export function statoTerminale(stato: StatoIntervento): boolean {
  return TRANSIZIONI[stato]?.length === 0;
}

// Esiti che richiedono una motivazione obbligatoria (causali KO / rinvio).
const ESITI_CON_MOTIVO: ReadonlySet<EsitoIntervento> = new Set([
  'accesso_negato',
  'contatore_non_trovato',
  'dati_ubicazione_insufficienti',
  'accesso_a_vuoto',
  'rinviato',
]);

export function esitoRichiedeMotivo(esito: EsitoIntervento): boolean {
  return ESITI_CON_MOTIVO.has(esito);
}

// Un esito può essere registrato solo su un intervento completato.
export function esitoAmmessoPerStato(stato: StatoIntervento): boolean {
  return stato === 'completato';
}

// Entra nel numeratore dei KPI di efficienza (gli accessi a vuoto sono esclusi).
export function esitoEntraNelNumeratoreKpi(esito: EsitoIntervento): boolean {
  return esito === 'eseguito_positivo';
}

// Validazione completa di un cambio di stato (+ esito quando si completa).
export function validaCambioStato(args: {
  da: StatoIntervento;
  a: StatoIntervento;
  esito?: EsitoIntervento | null;
  esitoMotivo?: string | null;
}): { ok: true } | { ok: false; errore: string } {
  const { da, a, esito, esitoMotivo } = args;
  if (!transizioneValida(da, a)) {
    return { ok: false, errore: `Transizione non valida: ${da} → ${a}` };
  }
  if (a === 'completato') {
    if (!esito) return { ok: false, errore: 'Esito obbligatorio per completare l’intervento' };
    if (esitoRichiedeMotivo(esito) && !esitoMotivo?.trim()) {
      return { ok: false, errore: `Motivazione obbligatoria per l’esito "${esito}"` };
    }
  }
  return { ok: true };
}
