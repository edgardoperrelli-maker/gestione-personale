import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export const runtime = 'nodejs';

const COMMITTENTE = 'acea';
const PROIEZIONE = 'matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';
const PAGINA = 1000;

/**
 * GET /api/r/[token]/censimento — cache offline del censimento Acea.
 * La versione è "<count>:<maxId>": un nuovo import alza max(id) → cambia versione.
 *
 * Tre modalità, tutte sulla stessa versione:
 *   ?v=<versione>            → { unchanged:true } se coincide, altrimenti TUTTE le righe.
 *                              È il contratto STORICO: `aggiornaCensimento` continua a girarci.
 *   ?meta=1&v=<versione>     → { unchanged, versione, totale } senza dati: due query e
 *                              ~40 byte, è il controllo che si fa a ogni apertura del link.
 *   ?from=&to=&v=<versione>  → { righe } di UNA pagina, per il download con la barra.
 *                              Con `v` diverso dalla versione corrente risponde 409: se un
 *                              import atterra a metà scaricamento le pagine sarebbero di due
 *                              dataset diversi, e la cache verrebbe su incoerente.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Il token deve essere un link operatore reale (non gate sullo stato: è dato di riferimento).
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Versione = count + max(id) del dataset acea.
  const { count } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select('id', { count: 'exact', head: true })
    .eq('committente', COMMITTENTE);
  const { data: maxRow } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select('id')
    .eq('committente', COMMITTENTE)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versione = `${count ?? 0}:${(maxRow as { id: number } | null)?.id ?? 0}`;

  const qs = new URL(req.url).searchParams;
  const vClient = qs.get('v') ?? '';

  // Solo metadati: quanto c'è da scaricare, senza scaricarlo.
  if (qs.get('meta') === '1') {
    return NextResponse.json({ unchanged: vClient === versione, versione, totale: count ?? 0 });
  }

  // Una pagina sola, per il download con la barra.
  const fromRaw = qs.get('from');
  if (fromRaw !== null) {
    if (vClient !== versione) {
      return NextResponse.json({ error: 'versione_cambiata', versione }, { status: 409 });
    }
    const from = Math.max(0, Number(fromRaw) || 0);
    const to = Math.max(from, Number(qs.get('to')) || from);
    const { data, error } = await supabaseAdmin
      .from('limitazione_misuratori_ref')
      .select(PROIEZIONE)
      .eq('committente', COMMITTENTE)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ versione, righe: (data ?? []) as CensitoMisuratore[] });
  }

  if (vClient === versione) return NextResponse.json({ unchanged: true, versione });

  // Fetch completo PAGINATO (PostgREST tronca a 1000).
  const righe: CensitoMisuratore[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('limitazione_misuratori_ref')
      .select(PROIEZIONE)
      .eq('committente', COMMITTENTE)
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    righe.push(...((data ?? []) as CensitoMisuratore[]));
    if (!data || data.length < PAGINA) break;
  }

  return NextResponse.json({ unchanged: false, versione, righe });
}
