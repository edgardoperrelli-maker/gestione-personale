// lib/interventi/caricaNotePrecedenti.ts
// I/O delle note "tramandate" (lib/interventi/notePrecedenti.ts): date le voci di un
// rapportino, carica i PRECEDENTI interventi chiusi positivi sullo stesso impianto
// (match per matricola/PDR, STESSO committente), le note compilate nelle loro voci di
// rapportino e i nomi operatore. Client Supabase per dependency injection (riusabile
// da pagina e route). Sola lettura, nessuna migrazione.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  costruisciNotePrecedenti,
  mappaNotePerIntervento,
  normChiaveImpianto,
  type InterventoPrecedenteRow,
  type NotaPrecedente,
  type VoceChiaviImpianto,
} from './notePrecedenti';

const CHUNK = 200; // .in() via querystring: a blocchi per non sforare i limiti URL

const COLONNE_INTERVENTO = 'id, committente, data, matricola_contatore, pdr, intervento_tipo, staff_id';

/** Varianti di una chiave per il match esatto di `.in()` (il DB può differire nel case). */
function varianti(valori: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of valori) {
    if (!normChiaveImpianto(v)) continue; // corta/placeholder → non identificante
    const t = String(v).trim();
    out.add(t);
    out.add(t.toUpperCase());
    out.add(t.toLowerCase());
  }
  return [...out];
}

async function interventiPositiviPer(
  db: SupabaseClient,
  colonna: 'matricola_contatore' | 'pdr',
  chiavi: string[],
  dataMax: string | undefined,
  acc: Map<string, InterventoPrecedenteRow>,
): Promise<void> {
  for (let i = 0; i < chiavi.length; i += CHUNK) {
    let q = db
      .from('interventi')
      .select(COLONNE_INTERVENTO)
      .eq('esito', 'eseguito_positivo')
      .in(colonna, chiavi.slice(i, i + CHUNK));
    if (dataMax) q = q.lte('data', dataMax);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of (data ?? []) as unknown as InterventoPrecedenteRow[]) acc.set(r.id, r);
  }
}

/**
 * Risolve il committente di ogni voce dall'intervento collegato (rapportino_voci.intervento_id
 * → interventi.committente): serve a confinare la ricerca allo stesso committente. Le voci
 * senza intervento collegato restano con committente indefinito (default 'acea' a valle).
 */
async function committentePerVoce(
  db: SupabaseClient,
  interventoIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < interventoIds.length; i += CHUNK) {
    const { data, error } = await db
      .from('interventi')
      .select('id, committente')
      .in('id', interventoIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ id: string; committente: string | null }>) {
      if (r.committente) out.set(r.id, r.committente);
    }
  }
  return out;
}

/**
 * Note dei precedenti interventi positivi sullo stesso impianto, per voce.
 * `dataMax` (YYYY-MM-DD, tipicamente la data del rapportino) esclude interventi futuri.
 * Gli errori NON sono gestiti qui: il chiamante decide se sono fatali (la pagina
 * operatore li tratta come non fatali → nessuna nota).
 */
export async function caricaNotePrecedenti(
  db: SupabaseClient,
  vociInput: VoceChiaviImpianto[],
  opts: { dataMax?: string } = {},
): Promise<Map<string, NotaPrecedente[]>> {
  const vuota = new Map<string, NotaPrecedente[]>();

  // 1) Committente di ogni voce (dall'intervento collegato) → confinamento per committente.
  const interventoIds = [...new Set(vociInput.map((v) => v.interventoId).filter((x): x is string => Boolean(x)))];
  const commByIntervento = interventoIds.length > 0 ? await committentePerVoce(db, interventoIds) : new Map<string, string>();
  const voci: VoceChiaviImpianto[] = vociInput.map((v) => ({
    ...v,
    committente: v.committente ?? (v.interventoId ? commByIntervento.get(v.interventoId) ?? null : null),
  }));

  // 2) Interventi positivi che condividono matricola/PDR con almeno una voce.
  const matricole = varianti(voci.map((v) => v.matricola));
  const pdrs = varianti(voci.map((v) => v.pdr));
  if (matricole.length === 0 && pdrs.length === 0) return vuota;

  const perId = new Map<string, InterventoPrecedenteRow>();
  await interventiPositiviPer(db, 'matricola_contatore', matricole, opts.dataMax, perId);
  await interventiPositiviPer(db, 'pdr', pdrs, opts.dataMax, perId);

  const propriIds = new Set(voci.map((v) => v.interventoId).filter(Boolean));
  const ids = [...perId.keys()].filter((id) => !propriIds.has(id));
  if (ids.length === 0) return vuota;

  // 3) Note compilate nelle voci di quegli interventi (la più recente vince per intervento).
  const righeNote: Array<{ intervento_id: string | null; risposte: unknown }> = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from('rapportino_voci')
      .select('intervento_id, risposte, updated_at')
      .in('intervento_id', ids.slice(i, i + CHUNK))
      .order('updated_at', { ascending: false });
    if (error) throw error;
    righeNote.push(...((data ?? []) as Array<{ intervento_id: string | null; risposte: unknown }>));
  }
  const notePerIntervento = mappaNotePerIntervento(righeNote);
  if (notePerIntervento.size === 0) return vuota;

  // 4) Nomi operatore per la firma della nota.
  const staffIds = [
    ...new Set([...perId.values()].map((r) => r.staff_id).filter((s): s is string => Boolean(s))),
  ];
  const staffNomi = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data } = await db.from('staff').select('id, display_name').in('id', staffIds);
    for (const s of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (s.display_name) staffNomi.set(s.id, s.display_name);
    }
  }

  return costruisciNotePrecedenti({
    voci,
    interventi: [...perId.values()],
    notePerIntervento,
    staffNomi,
  });
}
