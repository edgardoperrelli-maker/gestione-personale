import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { risincronizzaGiorno } from '@/lib/interventi/risincronizzaGiorno';

export const runtime = 'nodejs';

/**
 * POST /api/interventi/risincronizza?data=YYYY-MM-DD  (admin)
 * Ri-aggancia le voci scollegate agli interventi del giorno (ODL/matricola/PDR) e
 * riapplica l'esito corrente di ogni voce compilata sull'intervento collegato,
 * SENZA inviare i rapportini. Idempotente. Recupera i rapportini già compilati
 * prima che l'auto-aggancio fosse attivo.
 *
 * La logica sta in `lib/interventi/risincronizzaGiorno.ts`, condivisa con il recupero su
 * INTERVALLO (`/api/interventi/recupera-orfane`): il modulo Live naviga solo [oggi−7, oggi],
 * quindi da qui non si arriva ai giorni dove le orfane si sono accumulate.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const esito = await risincronizzaGiorno(supabaseAdmin, data);
    return NextResponse.json({ ok: true, ...esito });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore risincronizzazione.' }, { status: 500 });
  }
}
