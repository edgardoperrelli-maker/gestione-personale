// lib/interventi/caricaOdlPositivi.ts
// I/O condiviso dell'invariante "ODL positivo = definitivamente chiuso" (lib/interventi/odlPositivi.ts):
// dato un elenco di ODL, ritorna il set (normalizzato) di quelli che hanno GIÀ un esito
// positivo — in `interventi` (esito='eseguito_positivo', qualsiasi data) oppure in una voce
// di rapportino compilata SI (copre anche il caso "voce positiva con intervento annullato").
// Client Supabase per dependency injection (riusabile da route API e script, come ensure).
import type { SupabaseClient } from '@supabase/supabase-js';
import { normOdl, setOdl, vocePositiva } from './odlPositivi';

const CHUNK = 200; // .in() via querystring: a blocchi per non sforare i limiti URL

export async function caricaOdlGiaPositivi(
  db: SupabaseClient,
  odls: string[],
  opts: { escludiPianoId?: string } = {},
): Promise<Set<string>> {
  const puliti = [...new Set(odls.map((o) => (o ?? '').trim()).filter(Boolean))];
  const positivi = new Set<string>();
  if (puliti.length === 0) return positivi;

  for (let i = 0; i < puliti.length; i += CHUNK) {
    const blocco = puliti.slice(i, i + CHUNK);

    let qInt = db
      .from('interventi')
      .select('odl')
      .eq('committente', 'acea')
      .eq('esito', 'eseguito_positivo')
      .in('odl', blocco);
    if (opts.escludiPianoId) qInt = qInt.or(`piano_id.is.null,piano_id.neq.${opts.escludiPianoId}`);
    const { data: posInterventi } = await qInt;
    for (const k of setOdl(((posInterventi ?? []) as Array<{ odl: string | null }>).map((r) => r.odl))) {
      positivi.add(k);
    }

    let qVoci = db
      .from('rapportino_voci')
      .select('odl, risposte, rapportini!inner(piano_id)')
      .in('odl', blocco);
    if (opts.escludiPianoId) qVoci = qVoci.neq('rapportini.piano_id', opts.escludiPianoId);
    const { data: posVoci } = await qVoci;
    for (const v of (posVoci ?? []) as Array<{ odl: string | null; risposte: Record<string, unknown> | null }>) {
      if (vocePositiva(v.risposte)) {
        const k = normOdl(v.odl);
        if (k) positivi.add(k);
      }
    }
  }
  return positivi;
}
