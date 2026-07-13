// lib/interventi/misuratoriDaRimuovere.ts
// PURO: dato l'insieme degli interventi che oggi QUALIFICANO come rimozione
// misuratore ACEA positiva, decide quali righe del registro "Misuratori Rimossi"
// il Ricalcola deve eliminare.
//
// Regola: una riga già presente il cui intervento non qualifica più va rimossa,
// A PRESCINDERE dallo stato logistico (da_consegnare_deposito, scaricato_deposito,
// verificato_deposito, in_consegna_committente, consegnato_committente). Così il
// Ricalcola ripulisce anche le righe GIÀ ENTRATE e poi avanzate nel flusso:
//   • interventi corretti da esito positivo a negativo
//   • rimozioni riclassificate come "impianto abusivo" (mai da registrare, perché
//     il misuratore non entra nei magazzini)
//
// Guardrail: se l'insieme qualificante è vuoto (query degenerata / DB di test)
// non si rimuove nulla, per evitare uno svuotamento di massa accidentale.

export type RigaRegistro = { id: string; intervento_id: string | null };

export function righeMisuratoriDaRimuovere(
  existing: readonly RigaRegistro[],
  qualifyingIds: ReadonlySet<string>,
): string[] {
  if (qualifyingIds.size === 0) return [];
  return existing
    .filter((r) => r.intervento_id && !qualifyingIds.has(r.intervento_id))
    .map((r) => r.id);
}
