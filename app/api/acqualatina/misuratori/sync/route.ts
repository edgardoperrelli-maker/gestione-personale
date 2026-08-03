import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { sincronizzaRegistro, COMMESSA_ACQUALATINA, ErroreSync } from '@/lib/misuratori/sincronizzaRegistro';

export const runtime = 'nodejs';

/**
 * POST /api/acqualatina/misuratori/sync — «Ricalcola» del registro AcquaLatina.
 *
 * Mancava del tutto, e con esso l'unico modo di recuperare il pregresso. Serviva più di quanto
 * sembrasse: il registro si riempiva SOLO all'invio del rapportino, e quell'upsert falliva a
 * ogni chiusura per via di un indice di unicità parziale che `ON CONFLICT` non poteva
 * agganciare — in silenzio, perché l'errore non veniva letto. Il ricalcolo ricostruisce dal
 * lavoro positivo, che è il dato vero, e da qui in poi la commessa ha lo stesso gesto di ACEA.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const esito = await sincronizzaRegistro(COMMESSA_ACQUALATINA);
    return NextResponse.json({ ok: true, ...esito });
  } catch (e) {
    const messaggio = e instanceof ErroreSync || e instanceof Error ? e.message : 'Ricalcolo non riuscito.';
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
