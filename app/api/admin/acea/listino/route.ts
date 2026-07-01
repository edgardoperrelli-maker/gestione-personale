import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminPlus } from '@/lib/apiAuth';
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';
import { voceDaAttivita, kpiCode, type Voce } from '@/lib/produzione/voceDaAttivita';

export const runtime = 'nodejs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** voce/kpi coerenti (il CHECK del DB li vuole abbinati; NULL su entrambi se non classificabile). */
function voceKpi(etichetta: string): { voce: Voce | null; kpi: string | null } {
  const voce = voceDaAttivita(etichetta);
  return { voce, kpi: voce != null ? kpiCode(voce) : null };
}

/** GET: listino ACEA per attività. */
export async function GET() {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('acea_listino')
    .select('id, committente, attivita, etichetta, voce, kpi, prezzo, valido_dal, valido_al, attivo, note')
    .eq('committente', 'acea')
    .not('attivita', 'is', null)
    .order('etichetta', { ascending: true })
    .order('valido_dal', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listino: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

/** POST: nuova tariffa per un'attività (chiave normalizzata dall'etichetta). */
export async function POST(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json()) as {
    etichetta?: string; prezzo?: number; valido_dal?: string; valido_al?: string | null; note?: string;
  };
  const norm = normalizzaAttivita(b.etichetta);
  if (!norm) return NextResponse.json({ error: 'attivita_mancante' }, { status: 422 });
  if (!b.valido_dal || !ISO.test(b.valido_dal)) {
    return NextResponse.json({ error: 'valido_dal_non_valido' }, { status: 422 });
  }
  if (b.valido_al != null && b.valido_al !== '' && !ISO.test(b.valido_al)) {
    return NextResponse.json({ error: 'valido_al_non_valido' }, { status: 422 });
  }
  const { voce, kpi } = voceKpi(norm.etichetta);
  const { error } = await supabaseAdmin.from('acea_listino').insert({
    committente: 'acea',
    attivita: norm.key,
    etichetta: norm.etichetta,
    voce,
    kpi,
    prezzo: Number(b.prezzo ?? 0),
    valido_dal: b.valido_dal,
    valido_al: b.valido_al && b.valido_al !== '' ? b.valido_al : null,
    note: b.note ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PATCH: aggiorna una riga (prezzo / periodo / attivo / note). */
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

/** DELETE ?id=: rimuove una riga listino. */
export async function DELETE(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_mancante' }, { status: 422 });
  const { error } = await supabaseAdmin.from('acea_listino').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
