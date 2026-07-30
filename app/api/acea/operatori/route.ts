import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { finestraProgrammabile } from '@/lib/acea/operatoriGiorno';

export const runtime = 'nodejs';

/**
 * GET /api/acea/operatori — la finestra programmabile e chi c'è in cronoprogramma, giorno per giorno.
 *
 * Una chiamata sola per entrambi i giorni: cambiare giorno nella barra azioni deve essere immediato,
 * e sono al massimo due elenchi di una decina di nomi.
 *
 * «Oggi» lo decide il server, in fuso Europe/Rome: con l'orologio del browser, un PC con la data
 * sbagliata — o semplicemente un fuso diverso — proporrebbe due giorni che il server poi rifiuta,
 * e il rifiuto sembrerebbe un guasto.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const oggi = partiRoma(new Date()).oggi;
    const giorni = await finestraProgrammabile(oggi);
    return NextResponse.json({ oggi, giorni }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cronoprogramma non disponibile.' },
      { status: 500 },
    );
  }
}
