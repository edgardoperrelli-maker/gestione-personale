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

  /*
    Gli interventi che una voce ce l'hanno GIA' non sono candidati: un intervento ha una voce
    sola, ed e` l'invariante su cui poggia tutto il resto — il positivo che non si declassa
    (`decisioneScritturaEsito`), la voce che segue lo spostamento, l'esito che il registro legge.
    Agganciare qui significherebbe FABBRICARE lo stato che quelle regole esistono per impedire.

    E` la seconda meta` del guard sulle voci rifiutate (migration 20260810160000): li` si era
    chiuso il caso della voce rifiutata che scivola sul PDR e prende l'intervento del contatore
    accanto, ma la scivolata non ha niente a che vedere col rifiuto — il PDR e` del PUNTO, non
    del contatore, e due misuratori nello stesso stabile lo condividono. Caso vero trovato il
    17/08/2026: la voce orfana di PASTORELLI del 22/06 (ODL 912232071) non trova il proprio ODL,
    scivola sul PDR 4000133725 e aggancia un intervento gia` chiuso positivo CON la sua voce.
    Nessuna regola di ambiguita` scattava: su quel PDR l'intervento e` uno solo.

    Vale per il RECUPERO, che e` quel che fa questo modulo. La generazione dei rapportini crea
    la voce in quel momento e non passa di qui.
  */
  const { data: occupati } = await db
    .from('rapportino_voci')
    .select('intervento_id')
    .in('intervento_id', candidati.map((c) => (c as { id: string }).id));
  const conVoce = new Set(
    ((occupati ?? []) as Array<{ intervento_id: string | null }>)
      .map((o) => String(o.intervento_id ?? '')).filter(Boolean),
  );
  const liberi = (candidati as InterventoLinkRow[]).filter((c) => !conVoce.has(String(c.id)));
  if (liberi.length === 0) return null;

  const raw = (voce.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
  const trovato = buildVoceInterventoLinker(liberi)({
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
