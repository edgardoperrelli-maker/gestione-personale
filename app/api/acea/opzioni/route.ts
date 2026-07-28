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
  cap: 'cap',
} as const;

type ChiaveElenco = keyof typeof ELENCHI;

/** Tutti gli elenchi serviti, compresi quelli che non vengono dal registro. */
type ChiaveOpzione = ChiaveElenco | 'esecutori';
const TUTTI: ChiaveOpzione[] = [...(Object.keys(ELENCHI) as ChiaveElenco[]), 'esecutori'];

/**
 * I NOSTRI esecutori, presi da chi ha davvero un intervento su queste due commesse.
 *
 * Non da tutta l'anagrafica del personale: un elenco con ogni dipendente dell'azienda costringe a
 * cercare in mezzo a nomi che su ACEA non compaiono mai. Chi non ha ancora nessun intervento non
 * serve in un filtro — filtrarci sopra darebbe zero righe comunque.
 */
async function esecutori(): Promise<string[]> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('staff_id')
      .in('committente', ['acea', 'lim_massive'])
      .not('staff_id', 'is', null)
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    const righe = (data ?? []) as Array<{ staff_id: string | null }>;
    for (const r of righe) if (r.staff_id) ids.add(r.staff_id);
    if (righe.length < PAGINA) break;
  }
  if (ids.size === 0) return [];

  const nomi: string[] = [];
  const elenco = [...ids];
  for (let i = 0; i < elenco.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('staff')
      .select('display_name')
      .in('id', elenco.slice(i, i + 200));
    if (error) throw error;
    for (const s of (data ?? []) as Array<{ display_name: string | null }>) {
      if (s.display_name) nomi.push(s.display_name);
    }
  }
  return [...new Set(nomi)].sort((a, b) => a.localeCompare(b, 'it'));
}

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
      .filter((c): c is ChiaveOpzione => (TUTTI as string[]).includes(c));
    const daServire: ChiaveOpzione[] = chiesti.length > 0 ? chiesti : TUTTI;

    const valori = await Promise.all(
      daServire.map((c) => (c === 'esecutori' ? esecutori() : distinti(ELENCHI[c], famiglia))),
    );

    // Le chiavi non chieste tornano come array vuoti e non assenti: il client tipizza `Opzioni`
    // come record completo, e un campo mancante diventerebbe `undefined` dentro una `.map`.
    const risposta: Record<ChiaveOpzione, string[]> = {
      comuni: [], attivita: [], operatori: [], stati: [], cap: [], esecutori: [],
    };
    daServire.forEach((c, i) => { risposta[c] = valori[i]; });

    return NextResponse.json(risposta, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore opzioni filtri.' },
      { status: 500 },
    );
  }
}
