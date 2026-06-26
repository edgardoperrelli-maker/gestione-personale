import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { maiuscolo } from '@/lib/testo/maiuscolo';

export const runtime = 'nodejs';

// [id] = interventi_manuali.id (la riga mostrata nella tabella del modulo).
// PATCH per correzioni inline delle celle: aggiorna dati_correnti + la riga canonica.

type Campo = 'comune' | 'indirizzo' | 'n_segnalazione' | 'ora_inizio' | 'ora_fine' | 'assistente_te' | 'note' | 'data';

// Campo → (chiave anagrafica/risposta, colonna canonica interventi, è testo da maiuscolare)
const ANAGRAFICA: Partial<Record<Campo, string>> = { comune: 'comune', indirizzo: 'via' };
const RISPOSTE: Partial<Record<Campo, string>> = {
  n_segnalazione: 'n_segnalazione', ora_inizio: 'ora_inizio', ora_fine: 'ora_fine', assistente_te: 'assistente_te', note: 'note',
};
const COL_INTERVENTI: Partial<Record<Campo, string>> = { comune: 'comune', indirizzo: 'indirizzo', n_segnalazione: 'rif_esterno', data: 'data' };
const MAIUSCOLO = new Set<Campo>(['comune', 'indirizzo', 'n_segnalazione', 'assistente_te', 'note']);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json()) as { campo?: Campo; valore?: string };
  const campo = body.campo;
  if (!campo || (!(campo in ANAGRAFICA) && !(campo in RISPOSTE) && campo !== 'data')) {
    return NextResponse.json({ error: 'campo_non_valido' }, { status: 422 });
  }

  let valore = String(body.valore ?? '');
  if (MAIUSCOLO.has(campo)) valore = maiuscolo(valore) ?? '';
  if (campo === 'data' && valore && !/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    return NextResponse.json({ error: 'data_non_valida' }, { status: 422 });
  }

  const { data: rich } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, fonte, intervento_id, dati_correnti')
    .eq('id', id)
    .eq('fonte', 'pronto_intervento')
    .maybeSingle();
  if (!rich) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Aggiorna lo snapshot dati_correnti.
  const dc = (rich.dati_correnti ?? {}) as { committente?: string; anagrafica?: Record<string, unknown>; risposte?: Record<string, unknown> };
  const anagrafica = { ...(dc.anagrafica ?? {}) };
  const risposte = { ...(dc.risposte ?? {}) };
  if (ANAGRAFICA[campo]) anagrafica[ANAGRAFICA[campo] as string] = valore;
  if (RISPOSTE[campo]) risposte[RISPOSTE[campo] as string] = valore;

  const updManuale: Record<string, unknown> = { dati_correnti: { ...dc, anagrafica, risposte } };
  if (campo === 'data') updManuale.data = valore || null;
  await supabaseAdmin.from('interventi_manuali').update(updManuale).eq('id', id);

  // Propaga alla riga canonica interventi (se presente).
  if (rich.intervento_id && COL_INTERVENTI[campo]) {
    await supabaseAdmin.from('interventi').update({ [COL_INTERVENTI[campo] as string]: valore || null }).eq('id', rich.intervento_id);
  }

  return NextResponse.json({ ok: true });
}
