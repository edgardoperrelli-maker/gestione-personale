// Aggancio di una voce di rapportino rimasta SENZA intervento, al momento in cui qualcuno la tocca.
//
// Una voce orfana è un esito che non arriva da nessuna parte: lo Storico mostra «ESEGUITO SI»
// (legge la voce), l'intervento resta `assegnato`, il motore economico lo conta negativo e l'ODL
// finisce fra i «completati ACEA senza rapportino» (caso 957327236, 2026-08-05). Le orfane nascono
// dal ciclo delta+insert del piano — `rapportino_voci.intervento_id` è `on delete set null` — e
// restano tali finché qualcuno non le riaggancia.
//
// Ogni percorso che propaga un esito dalle voci agli interventi ha lo stesso identico prologo:
// «se la voce è scollegata, prova a collegarla». Scritto a mano quattro volte, era già stato
// dimenticato in tre. Qui sta una volta sola, e chi aggiunge il quinto percorso lo trova.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildVoceInterventoLinker, type InterventoLinkRow } from './voceInterventoLink';

export interface VoceDaAgganciare {
  id: string;
  /** Le chiavi originali del task, quando ci sono: `raw_json.odl`/`odsin`/`matricola`/`pdr`. */
  raw_json?: unknown;
  /** Le COLONNE della voce: fallback indispensabile — su molte voci il `raw_json` non le porta. */
  odl?: string | null;
  matricola?: string | null;
  pdr?: string | null;
  via?: string | null;
  taskVia?: boolean;
  /** Stato di approvazione: una voce `rifiutato` non si aggancia (regola di `buildVoceInterventoLinker`). */
  approvazione_stato?: string | null;
}

/**
 * Cerca l'intervento della voce fra quelli dell'operatore in quella giornata e, se lo trova senza
 * ambiguità, PERSISTE il collegamento. Torna l'id agganciato, o `null` se non c'è un candidato
 * certo (meglio nessun collegamento che quello sbagliato: è la regola di `buildVoceInterventoLinker`).
 *
 * Best-effort per costruzione: un fallimento non deve rompere il salvataggio che l'ha invocata.
 */
export async function agganciaVoceOrfana(
  db: SupabaseClient,
  voce: VoceDaAgganciare,
  rapportino: { staffId: string | null; data: string | null },
): Promise<string | null> {
  if (!rapportino.staffId || !rapportino.data) return null;
  const { data: candidati, error } = await db
    .from('interventi')
    .select('id, staff_id, odl, matricola_contatore, pdr, gruppo_attivita, indirizzo')
    .eq('staff_id', rapportino.staffId)
    .eq('data', rapportino.data)
    .neq('stato', 'annullato');
  if (error || !candidati?.length) return null;

  const raw = (voce.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
  const trovato = buildVoceInterventoLinker(candidati as InterventoLinkRow[])({
    staff_id: rapportino.staffId,
    odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? voce.odl,
    matricola: (raw.matricola as string | null | undefined) ?? voce.matricola,
    pdr: (raw.pdr as string | null | undefined) ?? voce.pdr,
    via: voce.via,
    taskVia: voce.taskVia,
    approvazione_stato: voce.approvazione_stato,
  });
  if (!trovato) return null;

  const { error: errUp } = await db.from('rapportino_voci').update({ intervento_id: trovato }).eq('id', voce.id);
  if (errUp) return null;
  return trovato;
}
