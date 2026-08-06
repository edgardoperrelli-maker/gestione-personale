// lib/rapportini/riagganciaVoci.ts
// Ogni voce di rapportino nasce col flusso del GRUPPO ATTIVITA' del suo intervento congelato
// dentro (template_id + campi_snapshot, scritti da sincronizzaRapportini). Se il legame
// gruppo→flusso cambia DOPO la generazione — un flusso nuovo che prende in carico un gruppo
// finora scoperto, un'attività spostata in un gruppo suo — le voci già in strada restano
// appese al flusso vecchio, e l'unica strada era rigenerare il rapportino. Rigenerare non
// sempre si può (il giro è già partito, il rapportino è in mano all'operatore): qui le voci
// dei rapportini ANCORA COMPILABILI vengono riagganciate al flusso giusto sul posto.
//
// Regola di sicurezza: si riaggancia SOLO verso un flusso che esiste e ha azioni. Mai il
// contrario — togliere le azioni a un rapportino aperto farebbe sparire campi che l'operatore
// può aver già compilato. Un gruppo rimasto senza flusso lascia le sue voci come stanno:
// vecchie ma compilabili. La stessa ragione per cui gli INVIATI non si toccano mai.
import type { SupabaseClient } from '@supabase/supabase-js';
import { chiaveTassonomia, committenteEquivalente } from '@/lib/attivita/tassonomia';
import { risolviFlussoPerGruppo, type TemplateFlussoRow } from '@/lib/rapportini/flussiGruppo';
import { idRapportiniCompilabili } from '@/lib/rapportini/propagaAzioni';
import { erroreColonnaMancante } from '@/lib/rapportini/colonneOpzionali';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type VoceAgganciata = { id: string; intervento_id: string | null; template_id: string | null };
export type InterventoGruppo = { id: string; committente?: string | null; gruppo_attivita?: string | null };
export type FlussoCollegato = TemplateFlussoRow & { nome?: string | null; campi?: unknown };
export type Riaggancio = { id: string; template_id: string; campi_snapshot: TemplateCampo[] };

/** PURA: quali voci vanno spostate su quale flusso. Fuori solo ciò che cambia davvero. */
export function calcolaRiagganci(
  voci: VoceAgganciata[],
  interventi: InterventoGruppo[],
  flussi: FlussoCollegato[],
): Riaggancio[] {
  const perIntervento = new Map(interventi.map((i) => [String(i.id), i]));
  const out: Riaggancio[] = [];
  for (const v of voci) {
    // Voce senza intervento: il suo flusso non è risolvibile per gruppo (vive sul modello
    // del rapportino). Non è "sbagliata", è di un'altra natura → non si tocca.
    const intervento = v.intervento_id ? perIntervento.get(String(v.intervento_id)) : undefined;
    if (!intervento) continue;
    const flusso = risolviFlussoPerGruppo(
      committenteEquivalente(intervento.committente),
      intervento.gruppo_attivita,
      flussi,
    );
    const campi = Array.isArray(flusso?.campi) ? (flusso.campi as TemplateCampo[]) : [];
    if (!flusso || campi.length === 0) continue; // niente destinazione → si lascia com'è
    if (flusso.id === v.template_id) continue; // già agganciata al flusso giusto
    out.push({ id: v.id, template_id: flusso.id, campi_snapshot: campi });
  }
  return out;
}

export type FiltroRiaggancio = {
  /** Restringe alle voci di questi interventi (spostamento di gruppo di un'attività). */
  interventiIds?: string[];
  /** Restringe alle voci dei gruppi di un flusso appena salvato (committente + gruppi). */
  gruppi?: { committente: string; nomi: string[] };
  /** Restringe a questi rapportini (riapertura: torna in mano all'operatore adesso). */
  rapportiniIds?: string[];
};

/**
 * Riaggancia le voci dei rapportini ancora in mano agli operatori. Best-effort per
 * costruzione: il chiamante ha già salvato ciò che doveva: un errore qui non deve annullarlo.
 */
export async function riagganciaVociAperte(
  db: SupabaseClient,
  nowIso: string,
  filtro: FiltroRiaggancio = {},
): Promise<{ voci: number }> {
  if (filtro.interventiIds && filtro.interventiIds.length === 0) return { voci: 0 };
  if (filtro.rapportiniIds && filtro.rapportiniIds.length === 0) return { voci: 0 };

  let idsAperti = await idRapportiniCompilabili(db, nowIso);
  if (filtro.rapportiniIds) {
    const voluti = new Set(filtro.rapportiniIds);
    idsAperti = idsAperti.filter((id) => voluti.has(id));
  }
  if (idsAperti.length === 0) return { voci: 0 };

  let q = db
    .from('rapportino_voci')
    .select('id, intervento_id, template_id')
    .in('rapportino_id', idsAperti);
  if (filtro.interventiIds) q = q.in('intervento_id', filtro.interventiIds);
  const { data: vociRows, error: eVoci } = await q;
  if (eVoci) {
    // Colonne per-voce non ancora migrate: non c'è niente da riagganciare.
    if (erroreColonnaMancante(eVoci, 'template_id') || erroreColonnaMancante(eVoci, 'intervento_id')) {
      return { voci: 0 };
    }
    throw new Error(`riaggancio voci: lettura voci: ${eVoci.message}`);
  }
  const voci = ((vociRows ?? []) as unknown) as VoceAgganciata[];
  const interventiIds = [...new Set(voci.map((v) => v.intervento_id).filter((x): x is string => Boolean(x)))];
  if (interventiIds.length === 0) return { voci: 0 };

  const { data: intRows, error: eInt } = await db
    .from('interventi')
    .select('id, committente, gruppo_attivita')
    .in('id', interventiIds);
  if (eInt) throw new Error(`riaggancio voci: lettura interventi: ${eInt.message}`);
  let interventi = ((intRows ?? []) as unknown) as InterventoGruppo[];

  // Filtro per gruppi del flusso salvato: si toccano solo le voci che quel flusso deve
  // davvero coprire, non tutto il parco rapportini aperti.
  if (filtro.gruppi) {
    const chiavi = new Set(filtro.gruppi.nomi.map((g) => chiaveTassonomia(g)).filter(Boolean));
    const c = filtro.gruppi.committente;
    interventi = interventi.filter(
      (i) =>
        chiavi.has(chiaveTassonomia(i.gruppo_attivita)) &&
        (c === 'altro' || committenteEquivalente(i.committente) === c),
    );
    if (interventi.length === 0) return { voci: 0 };
  }

  const { data: tplRows, error: eTpl } = await db
    .from('rapportino_template')
    .select('id, nome, campi, solo_manuale, gruppo_committente, gruppi_attivita')
    .eq('active', true);
  if (eTpl) throw new Error(`riaggancio voci: lettura flussi: ${eTpl.message}`);
  const flussi = (((tplRows ?? []) as unknown) as FlussoCollegato[]).filter((t) => Boolean(t.gruppo_committente));
  if (flussi.length === 0) return { voci: 0 };

  const riagganci = calcolaRiagganci(voci, interventi, flussi);
  if (riagganci.length === 0) return { voci: 0 };

  // Una UPDATE per flusso di destinazione: le voci che finiscono sullo stesso flusso
  // condividono lo stesso snapshot di azioni.
  const perFlusso = new Map<string, { campi: TemplateCampo[]; ids: string[] }>();
  for (const r of riagganci) {
    const acc = perFlusso.get(r.template_id) ?? { campi: r.campi_snapshot, ids: [] };
    acc.ids.push(r.id);
    perFlusso.set(r.template_id, acc);
  }
  for (const [templateId, { campi, ids }] of perFlusso) {
    const { error } = await db
      .from('rapportino_voci')
      .update({ template_id: templateId, campi_snapshot: campi })
      .in('id', ids);
    if (error) throw new Error(`riaggancio voci: scrittura: ${error.message}`);
  }
  return { voci: riagganci.length };
}
