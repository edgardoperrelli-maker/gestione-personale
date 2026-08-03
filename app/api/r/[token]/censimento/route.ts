import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { normMatricola } from '@/lib/limitazione/matricoleSimili';
import { censimentoMassive, firmaCensimentoMassive } from '@/lib/acea/caricaCensitiMassive';

export const runtime = 'nodejs';

const COMMITTENTE = 'acea';
const PROIEZIONE = 'matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';
const PAGINA = 1000;

/**
 * GET /api/r/[token]/censimento — cache offline del censimento Acea.
 *
 * DUE FONTI, come la ricerca online (`/cerca-limitazione`): il registro `acea_ordini` (famiglia
 * massive, ordini aperti — la fonte viva, che conosce i paesi nuovi) e `limitazione_misuratori_ref`
 * (la fonte storica dell'agente, ferma a ZAGAROLO e LABICO). Senza la prima, un misuratore di
 * RIANO non si riconosceva offline e l'intervento nasceva senza ODL: invisibile poi nel modulo
 * Limitazioni massive, che registro e interventi li incrocia per ODL. Il campo è il posto dove il
 * segnale manca più spesso — una ricerca che funziona solo online non risolve il problema, lo
 * sposta.
 *
 * La versione è "<count>:<maxId>|<firma massive>": un import alza max(id) sulla fonte storica e
 * cambia conteggio/aggiornamento sul registro → cambia versione → il telefono riscarica.
 *
 * Tre modalità, tutte sulla stessa versione:
 *   ?v=<versione>            → { unchanged:true } se coincide, altrimenti TUTTE le righe.
 *                              È il contratto STORICO: `aggiornaCensimento` continua a girarci.
 *   ?meta=1&v=<versione>     → { unchanged, versione, totale } senza dati: è il controllo che si
 *                              fa a ogni apertura del link. `totale` è la somma delle due fonti,
 *                              quindi può sovrastimare di quanto si sovrappongono: lo scarico a
 *                              pagine si ferma da solo sulla prima pagina più corta del previsto.
 *   ?from=&to=&v=<versione>  → { righe } di UNA pagina, per il download con la barra.
 *                              Con `v` diverso dalla versione corrente risponde 409: se un
 *                              import atterra a metà scaricamento le pagine sarebbero di due
 *                              dataset diversi, e la cache verrebbe su incoerente.
 */

/** Tutte le righe della fonte storica, paginate (PostgREST tronca a 1000). */
async function righeStorico(): Promise<CensitoMisuratore[]> {
  const righe: CensitoMisuratore[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('limitazione_misuratori_ref')
      .select(PROIEZIONE)
      .eq('committente', COMMITTENTE)
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    righe.push(...((data ?? []) as CensitoMisuratore[]));
    if (!data || data.length < PAGINA) break;
  }
  return righe;
}

/**
 * Il censimento intero, registro PRIMA e fonte storica poi, senza doppioni.
 *
 * L'ordine decide chi vince il dedup, e vince il registro: il suo ODL è quello di adesso. Si
 * costruisce per intero anche quando serve una sola pagina — sono ~3.800 righe di otto colonne, e
 * impaginare due tabelle come se fossero una sola con un cursore condiviso costerebbe molto più
 * codice di quanto costi questa lettura, su un percorso che gira solo dopo un import.
 */
async function censimentoUnito(): Promise<CensitoMisuratore[]> {
  const [registro, storico] = await Promise.all([censimentoMassive(supabaseAdmin), righeStorico()]);
  const viste = new Set<string>();
  const out: CensitoMisuratore[] = [];
  for (const m of [...registro, ...storico]) {
    const k = String(m.odl ?? '').trim() || `matricola:${normMatricola(m.matricola)}`;
    if (viste.has(k)) continue;
    viste.add(k);
    out.push(m);
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Il token deve essere un link operatore reale (non gate sullo stato: è dato di riferimento).
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Versione = (count + max(id) della fonte storica) + firma del registro massive.
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
  // Best-effort: senza la firma del registro la versione resta quella storica e la cache continua
  // a funzionare come prima — meglio un censimento vecchio di un giro che nessun censimento.
  const firmaMassive = await firmaCensimentoMassive(supabaseAdmin).catch((e): string => {
    console.error('[censimento] firma registro non letta:', e);
    return '';
  });
  const versione = `${count ?? 0}:${(maxRow as { id: number } | null)?.id ?? 0}|${firmaMassive}`;

  const qs = new URL(req.url).searchParams;
  const vClient = qs.get('v') ?? '';

  // Solo metadati: quanto c'è da scaricare, senza scaricarlo.
  if (qs.get('meta') === '1') {
    const dalRegistro = Number(firmaMassive.split('@')[0] || 0);
    return NextResponse.json({
      unchanged: vClient === versione,
      versione,
      totale: (count ?? 0) + (Number.isFinite(dalRegistro) ? dalRegistro : 0),
    });
  }

  // Una pagina sola, per il download con la barra.
  const fromRaw = qs.get('from');
  if (fromRaw !== null) {
    if (vClient !== versione) {
      return NextResponse.json({ error: 'versione_cambiata', versione }, { status: 409 });
    }
    const from = Math.max(0, Number(fromRaw) || 0);
    const to = Math.max(from, Number(qs.get('to')) || from);
    try {
      const tutte = await censimentoUnito();
      return NextResponse.json({ versione, righe: tutte.slice(from, to + 1) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'lettura fallita' }, { status: 500 });
    }
  }

  if (vClient === versione) return NextResponse.json({ unchanged: true, versione });

  try {
    return NextResponse.json({ unchanged: false, versione, righe: await censimentoUnito() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'lettura fallita' }, { status: 500 });
  }
}
