import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { misuratoreRimossoVisibile } from '@/lib/interventi/misuratoreRimosso';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const dataInizio = searchParams.get('data_inizio');
  const dataFine   = searchParams.get('data_fine');
  const stato      = searchParams.get('stato');
  const comune     = searchParams.get('comune');
  const esecutore  = searchParams.get('esecutore');

  let query = supabaseAdmin
    .from('misuratori_rimossi')
    .select('*')
    .order('data_esecuzione', { ascending: false })
    .order('created_at', { ascending: false });

  if (dataInizio) query = query.gte('data_esecuzione', dataInizio);
  if (dataFine)   query = query.lte('data_esecuzione', dataFine);
  if (stato)      query = query.eq('stato', stato);
  if (comune)     query = query.ilike('comune', `%${comune}%`);
  if (esecutore)  query = query.eq('esecutore', esecutore);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Nasconde i record "fantasma": intervento corretto a esito negativo (es. "Nessun
  // passaggio" / "NO") mentre il record è ancora 'da_consegnare_deposito'. Nessun
  // misuratore è stato realmente rimosso, quindi non deve apparire in tabella.
  // Gli stati logistici avanzati restano visibili (vedi misuratoreRimossoVisibile).
  const interventoIds = [...new Set(
    rows.map(r => r.intervento_id).filter((id): id is string => !!id),
  )];

  let esitoMap = new Map<string, string | null>();
  if (interventoIds.length > 0) {
    const { data: interventi } = await supabaseAdmin
      .from('interventi')
      .select('id, esito')
      .in('id', interventoIds);
    esitoMap = new Map((interventi ?? []).map(i => [i.id as string, (i.esito ?? null) as string | null]));
  }

  const visibili = rows.filter(r =>
    misuratoreRimossoVisibile(r, r.intervento_id ? esitoMap.get(r.intervento_id) : undefined),
  );

  return NextResponse.json(visibili);
}
