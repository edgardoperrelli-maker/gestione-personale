import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminPlus } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const KPI_DA_VOCE: Record<number, string> = { 10: 'EL', 11: 'ES', 12: 'ERC', 6: 'ERA' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET: listino ACEA completo (4 voci × periodi di validità). */
export async function GET() {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('acea_listino')
    .select('id, committente, voce, kpi, prezzo, valido_dal, valido_al, attivo, note')
    .eq('committente', 'acea')
    .order('voce', { ascending: true })
    .order('valido_dal', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listino: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

/** POST: nuova tariffa per una voce con periodo di validità. */
export async function POST(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json()) as {
    voce?: number; prezzo?: number; valido_dal?: string; valido_al?: string | null; note?: string;
  };
  const voce = Number(b.voce);
  if (!KPI_DA_VOCE[voce]) return NextResponse.json({ error: 'voce_non_valida' }, { status: 422 });
  if (!b.valido_dal || !ISO.test(b.valido_dal)) {
    return NextResponse.json({ error: 'valido_dal_non_valido' }, { status: 422 });
  }
  if (b.valido_al != null && b.valido_al !== '' && !ISO.test(b.valido_al)) {
    return NextResponse.json({ error: 'valido_al_non_valido' }, { status: 422 });
  }
  const { error } = await supabaseAdmin.from('acea_listino').insert({
    committente: 'acea',
    voce,
    kpi: KPI_DA_VOCE[voce],
    prezzo: Number(b.prezzo ?? 0),
    valido_dal: b.valido_dal,
    valido_al: b.valido_al && b.valido_al !== '' ? b.valido_al : null,
    note: b.note ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PATCH: aggiorna una riga listino (prezzo / periodo / attivo / note). */
export async function PATCH(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json()) as {
    id?: string; prezzo?: number; valido_dal?: string; valido_al?: string | null; attivo?: boolean; note?: string;
  };
  if (!b.id) return NextResponse.json({ error: 'id_mancante' }, { status: 422 });
  const patch: Record<string, unknown> = {};
  if (b.prezzo !== undefined) patch.prezzo = Number(b.prezzo);
  if (b.valido_dal !== undefined) {
    if (!ISO.test(b.valido_dal)) return NextResponse.json({ error: 'valido_dal_non_valido' }, { status: 422 });
    patch.valido_dal = b.valido_dal;
  }
  if (b.valido_al !== undefined) {
    if (b.valido_al != null && b.valido_al !== '' && !ISO.test(b.valido_al)) {
      return NextResponse.json({ error: 'valido_al_non_valido' }, { status: 422 });
    }
    patch.valido_al = b.valido_al && b.valido_al !== '' ? b.valido_al : null;
  }
  if (b.attivo !== undefined) patch.attivo = b.attivo;
  if (b.note !== undefined) patch.note = b.note;
  const { error } = await supabaseAdmin.from('acea_listino').update(patch).eq('id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id=: rimuove una riga listino (es. periodo inserito per errore). */
export async function DELETE(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_mancante' }, { status: 422 });
  const { error } = await supabaseAdmin.from('acea_listino').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
