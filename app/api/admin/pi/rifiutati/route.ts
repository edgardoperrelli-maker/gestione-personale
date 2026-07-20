import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** GET ?area=: rapportini P.I. rifiutati di una foglia (elenco "Rifiutati" del Riepilogo,
 *  con motivo). Da qui l'ufficio può riaprirli (→ POST interventi/[id]/riapri). */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const area = new URL(req.url).searchParams.get('area');

  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, data, staff_name, dati_correnti, motivo_rifiuto, anomalia_reperibilita, deciso_at')
    .eq('fonte', 'pronto_intervento')
    .eq('stato', 'rifiutato')
    .order('deciso_at', { ascending: false });
  if (area) q = q.eq('area_codice', area);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const righe = (data ?? []).map((r) => {
    const dc = (r.dati_correnti ?? {}) as { anagrafica?: Record<string, unknown>; risposte?: Record<string, unknown> };
    return {
      id: r.id,
      data: r.data,
      esecutore: r.staff_name,
      indirizzo: dc.anagrafica?.via ?? null,
      comune: dc.anagrafica?.comune ?? null,
      n_segnalazione: dc.risposte?.n_segnalazione ?? null,
      motivo_rifiuto: r.motivo_rifiuto,
      anomalia_reperibilita: r.anomalia_reperibilita,
    };
  });
  return NextResponse.json({ righe });
}
