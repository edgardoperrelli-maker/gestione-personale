import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { COMMITTENTI_ACEA } from '@/lib/acea/vociRapportino';

export const runtime = 'nodejs';

const PAGE = 1000;
const CHUNK = 200;

/**
 * POST /api/acea/backfill-ordini — collega gli interventi ACEA già esistenti al loro ordine.
 *
 * Si esegue DOPO il primo import: prima non c'è niente a cui agganciarsi. L'aggancio è per ODL —
 * `interventi` non porta il numero operazione e i pochi ordini con due operazioni non sarebbero
 * distinguibili — quindi si punta alla PRIMA operazione dell'ordine, in modo deterministico.
 *
 * Idempotente: tocca solo gli interventi con `ordine_id` nullo, quindi rilanciarlo non cambia
 * niente e non rompe i collegamenti già fatti.
 *
 * GET sulla stessa rotta risponde con lo stato della copertura, senza scrivere.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await copertura(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura copertura.' },
      { status: 500 },
    );
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    // Prima operazione di ogni ODL: è il bersaglio deterministico della FK.
    const idPerOdl = new Map<string, string>();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('acea_ordini')
        .select('id, odl, numero_operazione')
        .order('odl', { ascending: true })
        .order('numero_operazione', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ id: string; odl: string; numero_operazione: string }>;
      for (const r of righe) if (!idPerOdl.has(r.odl)) idPerOdl.set(r.odl, r.id);
      if (righe.length < PAGE) break;
    }
    if (idPerOdl.size === 0) {
      return NextResponse.json(
        { error: 'Registro vuoto: carica un export ACEA prima del backfill.' },
        { status: 409 },
      );
    }

    // Interventi ACEA ancora scollegati.
    const daCollegare: Array<{ id: string; odl: string }> = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl')
        .is('ordine_id', null)
        .not('odl', 'is', null)
        .in('committente', [...COMMITTENTI_ACEA])
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ id: string; odl: string }>;
      daCollegare.push(...righe);
      if (righe.length < PAGE) break;
    }

    // Un update per ordine, non uno per intervento: gli ODL con più interventi si aggiornano
    // insieme. Sono qualche migliaio di righe, non vale una stored procedure.
    const perOrdine = new Map<string, string[]>();
    let senzaOrdine = 0;
    for (const i of daCollegare) {
      const ordineId = idPerOdl.get(i.odl);
      if (!ordineId) { senzaOrdine++; continue; }
      perOrdine.set(ordineId, [...(perOrdine.get(ordineId) ?? []), i.id]);
    }

    let collegati = 0;
    for (const [ordineId, ids] of perOrdine) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const blocco = ids.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin
          .from('interventi')
          .update({ ordine_id: ordineId })
          .in('id', blocco);
        if (error) throw error;
        collegati += blocco.length;
      }
    }

    return NextResponse.json(
      {
        esaminati: daCollegare.length,
        collegati,
        // Non è un errore: sono gli interventi il cui ODL sta fuori dalla finestra dell'export,
        // o è stato annullato da ACEA. Restano senza collegamento, con la loro storia.
        senzaOrdineNelRegistro: senzaOrdine,
        ...(await copertura()),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore backfill.' },
      { status: 500 },
    );
  }
}

async function copertura(): Promise<{ interventiAcea: number; agganciati: number }> {
  const conta = async (soloAgganciati: boolean) => {
    let q = supabaseAdmin
      .from('interventi')
      .select('id', { count: 'exact', head: true })
      .in('committente', [...COMMITTENTI_ACEA]);
    if (soloAgganciati) q = q.not('ordine_id', 'is', null);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };
  return { interventiAcea: await conta(false), agganciati: await conta(true) };
}
