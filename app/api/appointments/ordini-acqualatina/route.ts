import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { espressioneRicerca, leggiFiltri } from '@/lib/acea/filtriOrdini';

/*
  Ricerca ordini AcquaLatina per il modulo Appuntamenti: il form di creazione richiede sempre di
  agganciare un appuntamento a una riga del registro (`acqualatina_ordini`), niente più PDR a
  testo libero. Riusa `espressioneRicerca` — le stesse colonne della ricerca del registro
  (odl, matricola, impianto, via, nominativo, testo_ordine) — così l'esperienza di ricerca resta
  la stessa che il registro già offre agli admin.

  Solo ordini ancora "da fissare": aperti, senza esito positivo, e non già agganciati a un altro
  appuntamento — un ordine già prenotato non deve poter essere prenotato una seconda volta.

  Auth allineata a `/api/appointments` (qualunque utente autenticato, non solo admin): il modulo
  Appuntamenti non è admin-only, e la ricerca è un prerequisito per crearne uno.
*/
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ righe: [] });

  const filtri = leggiFiltri(new URLSearchParams({ cerca: q }));
  const ricerca = espressioneRicerca(filtri);
  if (!ricerca) return NextResponse.json({ righe: [] });

  const { data: agganciati, error: erroreAgganciati } = await supabaseAdmin
    .from('appointments')
    .select('ordine_id')
    .not('ordine_id', 'is', null);
  if (erroreAgganciati) return NextResponse.json({ error: erroreAgganciati.message }, { status: 500 });
  const idAgganciati = [...new Set((agganciati ?? []).map((r) => r.ordine_id as string))];

  let query = supabaseAdmin
    .from('acqualatina_ordini')
    .select('id, odl, numero_operazione, impianto, matricola, nominativo, recapito, via, civico, cap, comune, provincia, stato_desc, causale_desc, testo_ordine')
    .eq('aperto', true)
    .not('esito_positivo', 'is', true)
    .or(ricerca)
    .order('odl', { ascending: true })
    .limit(30);

  if (idAgganciati.length > 0) query = query.not('id', 'in', `(${idAgganciati.join(',')})`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ righe: data ?? [] });
}
