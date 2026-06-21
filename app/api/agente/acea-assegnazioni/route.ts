import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { assegnabiliAcea, type InterventoAcea } from '@/lib/agente/assegnabiliAcea';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get('data') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });

  try {
    // interventi ACEA del giorno (con operatore, non annullati)
    const { data: intRaw, error: eInt } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, matricola_contatore, indirizzo, comune, staff_id, stato')
      .eq('committente', 'acea').eq('data', data).neq('stato', 'annullato');
    if (eInt) throw eInt;
    const interventi = ((intRaw ?? []) as Array<InterventoAcea & { stato: string }>);

    // staff_id -> display_name
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staffById: Record<string, string> = {};
    for (const s of (staffRows ?? []) as { id: string; display_name: string }[]) staffById[String(s.id)] = s.display_name;

    // odl già assegnati (reali) per quel giorno → idempotenza
    const { data: logRows } = await supabaseAdmin
      .from('acea_assegnazioni_log')
      .select('odl').eq('data_assegnazione', data).eq('esito', 'assegnato').eq('dry_run', false);
    const odlGia = new Set(((logRows ?? []) as { odl: string }[]).map((r) => r.odl));

    const { righe, scartati } = assegnabiliAcea(interventi, staffById, odlGia);
    return NextResponse.json({ data, righe, scartati }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore acea-assegnazioni.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
