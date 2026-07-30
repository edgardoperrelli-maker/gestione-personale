import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { finestraProgrammabile } from '@/lib/acea/operatoriGiorno';

export const runtime = 'nodejs';

/**
 * GET /api/acea/operatori?famiglia=dunning|massive — la finestra programmabile e chi c'è in
 * cronoprogramma, giorno per giorno.
 *
 * Una chiamata sola per entrambi i giorni: cambiare giorno nella barra azioni deve essere immediato,
 * e sono al massimo due elenchi di una decina di nomi.
 *
 * La famiglia decide QUALE attività di tabellone rende assegnabili (DUNNING o LIMITAZIONI
 * MASSIVE): la vista delle massive deve vedere chi quel giorno fa le massive, non la squadra del
 * dunning. Assente = dunning, il default storico.
 *
 * «Oggi» lo decide il server, in fuso Europe/Rome: con l'orologio del browser, un PC con la data
 * sbagliata — o semplicemente un fuso diverso — proporrebbe due giorni che il server poi rifiuta,
 * e il rifiuto sembrerebbe un guasto.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const fam = new URL(req.url).searchParams.get('famiglia');
    const oggi = partiRoma(new Date()).oggi;
    const giorni = await finestraProgrammabile(oggi, fam === 'massive' ? 'massive' : 'dunning');
    return NextResponse.json({ oggi, giorni }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cronoprogramma non disponibile.' },
      { status: 500 },
    );
  }
}
