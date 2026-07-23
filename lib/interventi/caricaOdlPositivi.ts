// lib/interventi/caricaOdlPositivi.ts
// I/O condiviso dell'invariante "ODL positivo = definitivamente chiuso" (lib/interventi/odlPositivi.ts):
// dato un elenco di ODL, ritorna i dettagli di quelli che hanno GIÀ un esito positivo — in
// `interventi` (esito='eseguito_positivo', qualsiasi data) oppure in una voce di rapportino
// compilata SI (copre anche il caso "voce positiva con intervento annullato"). Per ogni ODL si
// tiene l'ORIGINALE (positivo più vecchio per data), con data ed esecutore per i messaggi
// "già positivo il … (…)" di pianificazione, rapportino operatore e sweep.
// Client Supabase per dependency injection (riusabile da route API e script, come ensure).
import type { SupabaseClient } from '@supabase/supabase-js';
import { normOdl, vocePositiva } from './odlPositivi';

const CHUNK = 200; // .in() via querystring: a blocchi per non sforare i limiti URL

// Committenti della "classe ACEA" (committenteEquivalente): l'invariante di pianificazione
// storicamente copre gli ODL ACEA; lim_massive è la stessa numerazione ODL.
const COMMITTENTI_ACEA = ['acea', 'lim_massive'];

export type PositivoDettaglio = {
  /** id dell'intervento positivo originale (null se il positivo esiste solo come voce SI scollegata). */
  id: string | null;
  /** Data del positivo (YYYY-MM-DD), per il messaggio "già positivo il …". */
  data: string | null;
  /** Esecutore del positivo (display name), se risolvibile. */
  esecutore: string | null;
};

type Candidato = PositivoDettaglio & { staffId: string | null; daIntervento: boolean };

/** Il più vecchio per data vince (a parità, l'intervento batte la voce: è la fonte autorevole). */
function migliore(cur: Candidato | undefined, nuovo: Candidato): Candidato {
  if (!cur) return nuovo;
  const dCur = cur.data ?? '9999-12-31';
  const dNew = nuovo.data ?? '9999-12-31';
  if (dNew < dCur) return nuovo;
  if (dNew === dCur && !cur.daIntervento && nuovo.daIntervento) return nuovo;
  return cur;
}

/**
 * Mappa normOdl → dettaglio del positivo ORIGINALE (più vecchio). `escludiPianoId` esclude i
 * positivi del piano stesso (in modifica di un piano già lavorato il suo positivo non è un blocco).
 */
export async function caricaPositiviInfo(
  db: SupabaseClient,
  odls: Array<string | null | undefined>,
  opts: { escludiPianoId?: string } = {},
): Promise<Map<string, PositivoDettaglio>> {
  const puliti = [...new Set(odls.map((o) => (o ?? '').trim()).filter(Boolean))];
  const candidati = new Map<string, Candidato>();
  if (puliti.length === 0) return new Map();

  for (let i = 0; i < puliti.length; i += CHUNK) {
    const blocco = puliti.slice(i, i + CHUNK);

    let qInt = db
      .from('interventi')
      .select('id, odl, data, staff_id')
      .in('committente', COMMITTENTI_ACEA)
      .eq('esito', 'eseguito_positivo')
      .in('odl', blocco);
    if (opts.escludiPianoId) qInt = qInt.or(`piano_id.is.null,piano_id.neq.${opts.escludiPianoId}`);
    const { data: posInterventi } = await qInt;
    for (const r of (posInterventi ?? []) as Array<{ id: string; odl: string | null; data: string | null; staff_id: string | null }>) {
      const k = normOdl(r.odl);
      if (!k) continue;
      candidati.set(k, migliore(candidati.get(k), {
        id: r.id, data: r.data, esecutore: null, staffId: r.staff_id, daIntervento: true,
      }));
    }

    let qVoci = db
      .from('rapportino_voci')
      .select('odl, risposte, intervento_id, rapportini!inner(piano_id, data, staff_name)')
      .in('odl', blocco);
    if (opts.escludiPianoId) qVoci = qVoci.neq('rapportini.piano_id', opts.escludiPianoId);
    const { data: posVoci } = await qVoci;
    for (const v of (posVoci ?? []) as Array<{
      odl: string | null;
      risposte: Record<string, unknown> | null;
      intervento_id: string | null;
      rapportini: { data: string | null; staff_name: string | null } | Array<{ data: string | null; staff_name: string | null }>;
    }>) {
      if (!vocePositiva(v.risposte)) continue;
      const k = normOdl(v.odl);
      if (!k) continue;
      const rap = Array.isArray(v.rapportini) ? v.rapportini[0] : v.rapportini;
      candidati.set(k, migliore(candidati.get(k), {
        id: v.intervento_id, data: rap?.data ?? null, esecutore: rap?.staff_name ?? null,
        staffId: null, daIntervento: false,
      }));
    }
  }

  // Esecutori dei positivi da `interventi`: risoluzione batched su staff.
  const staffIds = [...new Set([...candidati.values()].map((c) => c.staffId).filter((x): x is string => !!x))];
  const staffById = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await db.from('staff').select('id, display_name').in('id', staffIds);
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (s.display_name) staffById.set(String(s.id), s.display_name);
    }
  }

  const out = new Map<string, PositivoDettaglio>();
  for (const [k, c] of candidati) {
    out.set(k, {
      id: c.id,
      data: c.data,
      esecutore: c.esecutore ?? (c.staffId ? (staffById.get(c.staffId) ?? null) : null),
    });
  }
  return out;
}

/** Set (normalizzato) degli ODL con positivo altrove — firma storica, ora derivata dai dettagli. */
export async function caricaOdlGiaPositivi(
  db: SupabaseClient,
  odls: string[],
  opts: { escludiPianoId?: string } = {},
): Promise<Set<string>> {
  return new Set((await caricaPositiviInfo(db, odls, opts)).keys());
}
