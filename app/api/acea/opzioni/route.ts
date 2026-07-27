import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const PAGINA = 1000;

/** Valori distinti di una colonna del registro, per popolare le tendine dei filtri. */
async function distinti(colonna: string, famiglia: string | null): Promise<string[]> {
  const valori = new Set<string>();
  for (let offset = 0; ; offset += PAGINA) {
    let q = supabaseAdmin.from('acea_ordini').select(colonna).range(offset, offset + PAGINA - 1);
    if (famiglia) q = q.eq('famiglia', famiglia);
    const { data, error } = await q;
    if (error) throw error;
    const righe = (data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const r of righe) {
      const v = r[colonna];
      if (typeof v === 'string' && v.trim() !== '') valori.add(v);
    }
    if (righe.length < PAGINA) break;
  }
  return [...valori].sort((a, b) => a.localeCompare(b, 'it'));
}

/**
 * GET /api/acea/opzioni?famiglia=dunning|massive — valori per le tendine dei filtri.
 *
 * Derivati dal registro, non da liste fisse: un comune o un'attività nuova compare da sola al
 * primo import che la contiene, senza toccare il codice.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const fam = searchParams.get('famiglia');
    const famiglia = fam === 'dunning' || fam === 'massive' ? fam : null;

    const [comuni, attivita, operatori, stati] = await Promise.all([
      distinti('comune', famiglia),
      distinti('attivita', famiglia),
      distinti('operatore_cognome', famiglia),
      distinti('stato_desc', famiglia),
    ]);

    return NextResponse.json(
      { comuni, attivita, operatori, stati },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore opzioni filtri.' },
      { status: 500 },
    );
  }
}
