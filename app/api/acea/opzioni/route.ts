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

/** Elenchi disponibili e colonna del registro da cui ciascuno deriva. */
const ELENCHI = {
  comuni: 'comune',
  attivita: 'attivita',
  operatori: 'operatore_cognome',
  stati: 'stato_desc',
} as const;

type ChiaveElenco = keyof typeof ELENCHI;

/**
 * GET /api/acea/opzioni?famiglia=dunning|massive[&campi=comuni,stati] — valori per i filtri.
 *
 * Derivati dal registro, non da liste fisse: un comune o un'attività nuova compare da sola al
 * primo import che la contiene, senza toccare il codice.
 *
 * `campi` limita il lavoro: ogni elenco costa una scansione paginata dell'intero registro, e chi
 * ha bisogno della sola tendina dei comuni (l'export del master) ne faceva partire quattro.
 * Omesso, torna tutto — è quello che serve alla tabella.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const fam = searchParams.get('famiglia');
    const famiglia = fam === 'dunning' || fam === 'massive' ? fam : null;

    const chiesti = (searchParams.get('campi') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c): c is ChiaveElenco => c in ELENCHI);
    const daServire: ChiaveElenco[] =
      chiesti.length > 0 ? chiesti : (Object.keys(ELENCHI) as ChiaveElenco[]);

    const valori = await Promise.all(daServire.map((c) => distinti(ELENCHI[c], famiglia)));

    // Le chiavi non chieste tornano come array vuoti e non assenti: il client tipizza `Opzioni`
    // come record completo, e un campo mancante diventerebbe `undefined` dentro una `.map`.
    const risposta: Record<ChiaveElenco, string[]> = { comuni: [], attivita: [], operatori: [], stati: [] };
    daServire.forEach((c, i) => { risposta[c] = valori[i]; });

    return NextResponse.json(risposta, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore opzioni filtri.' },
      { status: 500 },
    );
  }
}
