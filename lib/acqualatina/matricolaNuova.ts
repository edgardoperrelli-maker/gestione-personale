// lib/acqualatina/matricolaNuova.ts
// La matricola del misuratore INSTALLATO (sostituzione AcquaLatina): come impianto/nominativo/
// recapito, vive in tre copie — `rapportino_voci.risposte.matricola_nuova` (la risposta
// dell'operatore, la sorgente), `interventi.matricola_nuova` e `acqualatina_ordini.matricola_nuova`
// (lo specchio a registro, editabile in griglia) — e va tenuta allineata in ENTRAMBE le
// direzioni: dall'operatore/ufficio (modulo Interventi) verso il registro, e da una correzione
// in griglia (modulo AcquaLatina) verso l'intervento e la voce.
//
// A differenza di impianto/nominativo (che scendono dal master del committente), qui non c'è
// un file esterno da cui ripartire: il valore nasce da chi ci è andato o da chi lo corregge, e
// l'ultima scrittura vince — non una "correzione" contro un file, una sostituzione diretta.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Normalizza il valore: taglia gli spazi, stringa vuota → null. Nessuna maiuscolizzazione
 *  qui — la scrittura dal campo operatore la fa già `maiuscolaRisposteTesto` a monte; imporla
 *  di nuovo qui coprirebbe anche le correzioni d'ufficio, che possono avere un motivo per non
 *  essere tutte maiuscole (raro, ma non è questo il posto per deciderlo). */
export function valoreMatricolaNuova(v: unknown): string | null {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  const t = s.trim();
  return t === '' ? null : t;
}

/**
 * Propaga un valore appena scritto sull'INTERVENTO fino al registro: la corsia che percorrono
 * il salvataggio live dell'operatore (`app/api/r/[token]/voce`) e la correzione d'ufficio
 * (`app/api/admin/interventi/storico/voce/[voceId]`).
 *
 * Best-effort e silenziosa sull'assenza: un intervento senza `ordine_id` (non ancora agganciato,
 * o percorso Mappa) non ha un registro da raggiungere — non è un errore, è la normalità di
 * `agganciPerOdl`, che colma il collegamento più tardi.
 */
export async function propagaMatricolaNuovaARegistro(
  db: SupabaseClient,
  interventoId: string,
  valore: string,
): Promise<void> {
  const { data, error } = await db
    .from('interventi')
    .select('ordine_id, committente')
    .eq('id', interventoId)
    .maybeSingle();
  if (error) { console.error('[acqualatina] lettura ordine_id per matricola_nuova fallita:', error.message); return; }
  const row = data as { ordine_id: string | null; committente: string | null } | null;
  // `ordine_id` può puntare ad `acea_ordini` (stesso spazio di uuid, tabella diversa): senza
  // questo controllo un intervento non-acqualatina scriverebbe alla cieca su un registro che
  // non è il suo. In pratica `matricola_nuova` non esiste nelle risposte di altri committenti
  // (il campo è solo nel flusso SOSTITUZIONE MISURATORI), ma non è una garanzia da cui far
  // dipendere l'integrità di un altro registro.
  if (!row || row.committente !== 'acqualatina' || !row.ordine_id) return;
  const { error: eReg } = await db
    .from('acqualatina_ordini')
    .update({ matricola_nuova: valore, aggiornato_il: new Date().toISOString() })
    .eq('id', row.ordine_id);
  if (eReg) console.error('[acqualatina] matricola_nuova non propagata al registro:', eReg.message);
}

/**
 * Propaga un valore corretto in GRIGLIA (`acqualatina_ordini`, riga di registro) fino agli
 * interventi agganciati e, per ciascuno, alla voce di rapportino — sennò l'ufficio che corregge
 * dalla tabella vedrebbe il registro cambiare e il modulo Interventi restare com'era.
 *
 * Scrive su TUTTI gli interventi con quell'`ordine_id` (può essere più di uno: rientri sullo
 * stesso ordine) — la matricola nuova non ha senso su un esito negativo, ma scriverla lì è
 * innocuo, e distinguere «quale visita conta» richiederebbe un'euristica che qui non serve.
 */
export async function propagaMatricolaNuovaAInterventi(
  db: SupabaseClient,
  ordineId: string,
  valore: string,
): Promise<void> {
  const { data, error } = await db
    .from('interventi')
    .update({ matricola_nuova: valore })
    .eq('ordine_id', ordineId)
    .select('id');
  if (error) { console.error('[acqualatina] matricola_nuova non propagata agli interventi:', error.message); return; }
  const interventoIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (interventoIds.length === 0) return;

  const { data: voci, error: eVoci } = await db
    .from('rapportino_voci')
    .select('id, risposte')
    .in('intervento_id', interventoIds);
  if (eVoci) { console.error('[acqualatina] voci per matricola_nuova non lette:', eVoci.message); return; }
  for (const v of (voci ?? []) as Array<{ id: string; risposte: Record<string, unknown> | null }>) {
    const { error: eV } = await db
      .from('rapportino_voci')
      .update({ risposte: { ...(v.risposte ?? {}), matricola_nuova: valore } })
      .eq('id', v.id);
    if (eV) console.error('[acqualatina] matricola_nuova non propagata alla voce', v.id, eV.message);
  }
}
