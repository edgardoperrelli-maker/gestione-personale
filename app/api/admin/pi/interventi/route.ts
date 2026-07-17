import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { PATCH_KEY, PATCH_MATRICOLA_KEY } from '@/lib/pi/patch';

export const runtime = 'nodejs';

/** GET: tabella del modulo P.I. — richieste APPROVATE di una foglia, con i campi
 *  compilati e il totale di contabilità per riga. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const sp = new URL(req.url).searchParams;
  const area = sp.get('area');
  const from = sp.get('from');
  const to = sp.get('to');

  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, intervento_id, data, staff_name, dati_correnti, anomalia_reperibilita, deciso_at')
    .eq('fonte', 'pronto_intervento')
    .eq('stato', 'approvato')
    .order('data', { ascending: false });
  if (area) q = q.eq('area_codice', area);
  if (from) q = q.gte('data', from);
  if (to) q = q.lte('data', to);
  const { data: righe, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const interventoIds = (righe ?? []).map((r) => r.intervento_id).filter((v): v is string => !!v);
  const totali = new Map<string, number>();
  if (interventoIds.length > 0) {
    const { data: cont } = await supabaseAdmin
      .from('pi_contabilita_righe')
      .select('intervento_id, valore')
      .in('intervento_id', interventoIds);
    for (const c of (cont ?? []) as Array<{ intervento_id: string; valore: number }>) {
      totali.set(c.intervento_id, (totali.get(c.intervento_id) ?? 0) + Number(c.valore ?? 0));
    }
  }

  const out = (righe ?? []).map((r) => {
    const dc = (r.dati_correnti ?? {}) as { anagrafica?: Record<string, unknown>; risposte?: Record<string, unknown> };
    const a = dc.anagrafica ?? {};
    const rsp = dc.risposte ?? {};
    return {
      id: r.id,
      intervento_id: r.intervento_id,
      data: r.data,
      esecutore: r.staff_name,
      indirizzo: a.via ?? null,
      comune: a.comune ?? null,
      n_segnalazione: rsp.n_segnalazione ?? null,
      ora_inizio: rsp.ora_inizio ?? null,
      ora_fine: rsp.ora_fine ?? null,
      assistente_te: rsp.assistente_te ?? null,
      note: rsp.note ?? null,
      patch: rsp[PATCH_KEY] === true,
      patch_matricola: rsp[PATCH_MATRICOLA_KEY] ?? null,
      anomalia_reperibilita: r.anomalia_reperibilita,
      valore: r.intervento_id ? Math.round((totali.get(r.intervento_id) ?? 0) * 100) / 100 : 0,
    };
  });
  return NextResponse.json({ righe: out });
}
