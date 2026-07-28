// Helper puri della vista interventi.
//
// Il file nasceva (giugno 2026) a servizio di un modulo «Lista interventi» con barra
// filtri propria, poi sostituito dallo Storico interventi, che i filtri ce li ha suoi in
// `lib/interventi/storico/`. Il 2026-07-27 sono stati rimossi i pezzi rimasti orfani —
// `parseInterventiFilters` con i suoi quattro tipi di filtro, e `badgeGeocode` — che non
// avevano più un solo importatore fuori dal proprio test.
//
// I piani in `docs/superpowers/` li citano ancora: sono documenti storici, si leggono
// come tali e non si riscrivono a posteriori.

const STATO_LABELS: Record<string, string> = {
  da_assegnare: 'Da assegnare',
  assegnato: 'Assegnato',
  in_viaggio: 'In viaggio',
  sul_posto: 'Sul posto',
  in_esecuzione: 'In esecuzione',
  completato: 'Completato',
  annullato: 'Annullato',
};

/** Etichetta leggibile dello stato intervento (Live, export Excel). */
export function labelStato(stato: string | null | undefined): string {
  if (!stato) return '—';
  return STATO_LABELS[stato] ?? stato;
}

export type InterventoRow = {
  id: string;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
  committente: string | null;
  stato: string | null;
  geocode_status: string | null;
  nominativo: string | null;
  fascia_oraria: string | null;
  staff_id: string | null;
};
