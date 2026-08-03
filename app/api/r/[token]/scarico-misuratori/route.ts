import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { entroRiapertura, isScaduto } from '@/utils/rapportini/scadenza';
import { payloadScarico, registraScarico, type Rapportino } from '@/lib/acqualatina/scaricoMisuratori';

export const runtime = 'nodejs';

/*
  Lo scarico dei misuratori AcquaLatina in cesta, dal telefono dell'operatore.

  Endpoint pubblico a token come il resto di `/api/r/[token]/*`. La sicurezza sta in due punti
  fermi: l'operatore lo dice il TOKEN (mai il corpo della richiesta), e la scrittura tocca solo
  righe che sono sue e ancora da scaricare — vedi `registraScarico`.

  Il gate NON è `tokenStatus`: quello dichiara «inviato» non valido, e qui si arriva PROPRIO
  dopo l'invio. Il link deve essere ancora fresco, non ancora aperto.
*/

/** Il rapportino del token, se il link è ancora fresco. */
async function rapportinoDelToken(token: string): Promise<Rapportino | null> {
  const { data } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_name, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;
  const r = data as Rapportino & { riaperto_at: string | null };
  // Stessa finestra di freschezza di `tokenStatus`, meno il ramo che qui non serve: un link
  // vecchio non scarica più niente, una riapertura dall'ufficio lo rimette in gioco per le
  // sue 48 ore. Quello che NON si controlla è `stato`, perché qui si arriva proprio dopo
  // l'invio — con `tokenStatus` la richiesta si sarebbe respinta da sé.
  const ora = new Date().toISOString();
  const fresco = (r.riaperto_at && entroRiapertura(r.riaperto_at, ora)) || !isScaduto(r.data, ora);
  if (!fresco) return null;
  return { id: r.id, staff_name: r.staff_name, data: r.data };
}

/** GET — cosa deve scaricare l'operatore adesso (e con quali numeri di cesta). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rap = await rapportinoDelToken(token);
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    return NextResponse.json(await payloadScarico(rap));
  } catch (e) {
    // La domanda sullo scarico non deve poter rompere la schermata di fine giro: si tace.
    console.error('[scarico-misuratori] lettura fallita:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ mostra: false, oggi: [], arretrati: [], ceste: { numeroMin: null, numeroMax: null } });
  }
}

/** POST — «li sto scaricando nella cesta N». Corpo: `{ ids: string[], cesta: string }`. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rap = await rapportinoDelToken(token);
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; cesta?: unknown };
  const cesta = typeof body.cesta === 'string' ? body.cesta.trim() : '';
  if (!cesta) return NextResponse.json({ error: 'cesta_mancante' }, { status: 400 });
  const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v ?? '')) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'nessun_misuratore' }, { status: 400 });

  try {
    const scaricati = await registraScarico(rap.staff_name, ids, cesta);
    return NextResponse.json({ ok: true, scaricati, cesta });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'errore' },
      { status: 500 },
    );
  }
}
