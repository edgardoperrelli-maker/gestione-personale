// Verdetto "matricola già eseguita" per il blocco anti-duplicato al "+".
// PURO: nessun I/O. Combina la fonte master (limitazione_misuratori_stato) e la fonte DB
// (una voce di rapportino già positiva). Il master ha priorità nel motivare il blocco.

/** Matricola normalizzata: maiuscolo, solo A-Z0-9. Stessa logica del lookup limitazione. */
export function normMatricola(v: string): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type VerdettoEsecuzione = {
  bloccato: boolean;
  fonte?: 'master' | 'db';
  odl?: string | null;
  data?: string | null;
  esecutore?: string | null;
};

const t = (v?: string | null) => String(v ?? '').trim().toUpperCase();

/** True se l'esito/stato della fonte master indica un intervento POSITIVO già fatto. */
function masterPositivo(m: { esito?: string | null; stato_odl?: string | null }): boolean {
  // 'COMPLETAT' copre COMPLETATO/COMPLETATA ma NON "IN COMPLETAMENTO" (stato in transizione).
  return t(m.esito) === 'POSITIVO' || t(m.stato_odl).includes('COMPLETAT');
}

export function verdettoEsecuzione(input: {
  statoMaster?: { esito?: string | null; stato_odl?: string | null; odl?: string | null; esecutore?: string | null } | null;
  vocePositivaDb?: { odl?: string | null; data?: string | null } | null;
}): VerdettoEsecuzione {
  const m = input.statoMaster;
  if (m && masterPositivo(m)) {
    return { bloccato: true, fonte: 'master', odl: m.odl ?? null, data: null, esecutore: m.esecutore ?? null };
  }
  const v = input.vocePositivaDb;
  if (v) return { bloccato: true, fonte: 'db', odl: v.odl ?? null, data: v.data ?? null, esecutore: null };
  return { bloccato: false };
}
