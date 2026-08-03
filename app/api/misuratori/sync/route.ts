import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { sincronizzaRegistro, COMMESSA_ACEA, ErroreSync } from '@/lib/misuratori/sincronizzaRegistro';

export const runtime = 'nodejs';

/**
 * POST /api/misuratori/sync — «Ricalcola» del registro ACEA.
 *
 * Il motore sta in `lib/misuratori/sincronizzaRegistro`: la logica era qui dentro, ma la
 * commessa gemella aveva bisogno dello STESSO ricalcolo e duplicarlo voleva dire farle
 * divergere al primo fix applicato da una parte sola.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const esito = await sincronizzaRegistro(COMMESSA_ACEA);
    return NextResponse.json({ ok: true, ...esito });
  } catch (e) {
    const messaggio = e instanceof ErroreSync || e instanceof Error ? e.message : 'Ricalcolo non riuscito.';
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
