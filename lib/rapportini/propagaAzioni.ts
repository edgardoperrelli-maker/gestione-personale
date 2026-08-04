// lib/rapportini/propagaAzioni.ts
// Le azioni di un flusso vengono CONGELATE nei rapportini alla generazione
// (rapportini.campi_snapshot + rapportino_voci.campi_snapshot): senza questo motore, una
// modifica in «Azioni operatori» non raggiungeva mai il giro già in strada — il modulo
// mostrava un'opzione (es. «NESSUN PASSAGGIO» sull'ESEGUITO) che l'operatore non vedeva.
//
// Qui il salvataggio del flusso riallinea gli snapshot dei soli rapportini ANCORA IN MANO
// agli operatori: stato 'in_corso' e link valido secondo `tokenStatus`, che è la stessa
// regola con cui la pagina /r/[token] decide se il rapportino è compilabile. Gli INVIATI
// e gli scaduti restano congelati: sono il verbale di com'era il modulo quando sono stati
// compilati, e riscriverli cambierebbe la storia.
import type { SupabaseClient } from '@supabase/supabase-js';
import { tokenStatus, type RapportinoStato } from '@/utils/rapportini/tokenStatus';
import { erroreColonnaMancante } from '@/lib/rapportini/colonneOpzionali';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type EsitoPropagazione = {
  /** Rapportini compilabili che usano il flusso come modello (fallback) riallineati. */
  rapportini: number;
  /** Voci agganciate per-attività al flusso (dentro rapportini compilabili) riallineate. */
  voci: number;
};

type RapAperto = {
  id: string;
  template_id: string | null;
  data: string;
  stato: RapportinoStato;
  riaperto_at: string | null;
};

export async function propagaAzioniAiRapportiniAperti(
  db: SupabaseClient,
  templateId: string,
  campi: TemplateCampo[],
  nowIso: string,
): Promise<EsitoPropagazione> {
  // Candidati: i soli 'in_corso'. Il filtro fine (scadenza 48h, finestra di riapertura)
  // è `tokenStatus`, riusato tal quale: se un giorno la regola di validità cambia lì,
  // la propagazione la segue senza un secondo posto da aggiornare.
  const { data: rows, error: eRaps } = await db
    .from('rapportini')
    .select('id, template_id, data, stato, riaperto_at')
    .eq('stato', 'in_corso');
  if (eRaps) throw new Error(`propagazione azioni: lettura rapportini: ${eRaps.message}`);

  const aperti = (((rows ?? []) as unknown) as RapAperto[]).filter(
    (r) => tokenStatus({ stato: r.stato, data: r.data, riaperto_at: r.riaperto_at }, nowIso) === 'valido',
  );
  if (aperti.length === 0) return { rapportini: 0, voci: 0 };

  // 1) Snapshot a livello di rapportino: è il fallback delle voci senza flusso per-attività
  //    e l'intestazione del modello. Si tocca solo dove QUESTO flusso è il modello.
  const idsFallback = aperti.filter((r) => r.template_id === templateId).map((r) => r.id);
  if (idsFallback.length > 0) {
    const { error: eUp } = await db
      .from('rapportini')
      .update({ campi_snapshot: campi })
      .in('id', idsFallback);
    if (eUp) throw new Error(`propagazione azioni: rapportini: ${eUp.message}`);
  }

  // 2) Snapshot per-voce: le voci agganciate a questo flusso possono vivere anche in
  //    rapportini con un ALTRO modello di fallback (rapportini misti) → si cerca in tutti
  //    i compilabili. Resiliente: se le colonne per-voce non esistono ancora (migration
  //    20260720210000 non applicata), si propaga solo il livello rapportino.
  const idsAperti = aperti.map((r) => r.id);
  const { data: vociRows, error: eVoci } = await db
    .from('rapportino_voci')
    .select('id')
    .eq('template_id', templateId)
    .in('rapportino_id', idsAperti);
  if (eVoci) {
    if (erroreColonnaMancante(eVoci, 'template_id')) return { rapportini: idsFallback.length, voci: 0 };
    throw new Error(`propagazione azioni: lettura voci: ${eVoci.message}`);
  }
  const idsVoci = ((vociRows ?? []) as Array<{ id: string }>).map((v) => v.id);
  if (idsVoci.length > 0) {
    const { error: eUpVoci } = await db
      .from('rapportino_voci')
      .update({ campi_snapshot: campi })
      .in('id', idsVoci);
    if (eUpVoci) throw new Error(`propagazione azioni: voci: ${eUpVoci.message}`);
  }

  return { rapportini: idsFallback.length, voci: idsVoci.length };
}
