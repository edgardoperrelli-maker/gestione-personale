// lib/acea/propagaAnagrafica.ts
// La correzione anagrafica fatta in GRIGLIA (registro commesse) che scende sull'intervento
// agganciato e sulla sua voce di rapportino.
//
// È il gemello di `lib/acqualatina/propagaAnagrafica.ts`, che percorre la stessa catena nel
// verso opposto (Storico interventi → registro). Senza questa discesa l'ufficio correggerebbe
// l'indirizzo in tabella, vedrebbe la cella cambiare, e l'operatore continuerebbe ad andare
// dove diceva la voce di rapportino — che è già stata scritta e vive per conto suo.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  patchInterventoAnagrafica, patchVoceAnagrafica, type AnagraficaCelle,
} from './anagraficaCelle';

/**
 * Propaga la correzione dalla riga di registro (`ordineId`) fino alle voci di rapportino.
 *
 * `committenti` è il filtro del profilo di commessa, e non è pedanteria: `interventi.ordine_id`
 * punta a `acea_ordini` OPPURE a `acqualatina_ordini` — due tabelle, uno spazio di uuid solo —
 * e un update alla cieca sarebbe quasi certamente un no-op, ma «quasi certamente» non è una
 * garanzia da cui far dipendere l'anagrafica di un'altra commessa (stessa cautela di
 * `propagaMatricolaNuovaARegistro`).
 *
 * Gli ANNULLATI restano fuori: un intervento annullato è lavoro che non è mai successo, e la
 * stessa esclusione la applica la correzione dallo Storico.
 *
 * Best-effort: un errore qui non deve far fallire la scrittura sul registro, che è già passata.
 * Si logga e si tira avanti — la riga di registro, che è la fonte, resta corretta.
 */
export async function propagaAnagraficaAInterventi(
  db: SupabaseClient,
  ordineId: string,
  anagrafica: AnagraficaCelle,
  committenti: readonly string[],
): Promise<void> {
  const patchIntervento = patchInterventoAnagrafica(anagrafica);
  if (Object.keys(patchIntervento).length === 0) return;

  const { data, error } = await db
    .from('interventi')
    .update(patchIntervento)
    .eq('ordine_id', ordineId)
    .in('committente', [...committenti])
    .neq('stato', 'annullato')
    .select('id');
  if (error) {
    console.error('[acea/celle] anagrafica non propagata agli interventi:', error.message);
    return;
  }

  const interventoIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (interventoIds.length === 0) return;

  const { error: eVoci } = await db
    .from('rapportino_voci')
    .update(patchVoceAnagrafica(anagrafica))
    .in('intervento_id', interventoIds);
  if (eVoci) console.error('[acea/celle] anagrafica non propagata alle voci:', eVoci.message);
}
