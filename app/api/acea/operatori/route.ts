import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { finestraProgrammabile } from '@/lib/acea/operatoriGiorno';
import { eDataIso } from '@/lib/acea/giorniProgrammabili';
import { parseFamiglia } from '@/lib/acea/famiglia';

export const runtime = 'nodejs';

/**
 * GET /api/acea/operatori?famiglia=dunning|massive|acqualatina[&data=YYYY-MM-DD…] — i giorni su
 * cui si programma e chi c'è in cronoprogramma, giorno per giorno.
 *
 * Di suo risponde con i giorni PRONTI (oggi e il prossimo lavorativo) in una chiamata sola:
 * cambiare giorno nella barra azioni deve essere immediato, e sono due elenchi di una decina di
 * nomi. `data` chiede in più il tabellone di un giorno preciso della finestra — è quello che fa la
 * barra quando si sceglie il lunedì dal campo data: si paga la lettura del giorno che serve
 * davvero, invece di leggere in anticipo due settimane di tabellone che nessuno guarderà.
 *
 * Una data fuori finestra non si legge nemmeno: il tabellone di settembre non lo si fa chiedere.
 *
 * La famiglia decide QUALE attività di tabellone rende assegnabili (DUNNING, LIMITAZIONI MASSIVE
 * o CONTATORI): ogni vista deve vedere la squadra della SUA commessa quel giorno, non quella di
 * un'altra. Assente = dunning, il default storico.
 *
 * «Oggi» esce da qui perché lo decide il SERVER, in fuso Europe/Rome, ed è da lì che il client
 * ricava gli estremi del campo data (stessa funzione pura, `limitiFinestra`): con l'orologio del
 * browser, un PC con la data sbagliata — o semplicemente un fuso diverso — proporrebbe giorni che
 * il server poi rifiuta, e il rifiuto sembrerebbe un guasto.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const parametri = new URL(req.url).searchParams;
    const fam = parametri.get('famiglia');
    const oggi = partiRoma(new Date()).oggi;
    const giorni = await finestraProgrammabile(
      oggi,
      parseFamiglia(fam),
      parametri.getAll('data').filter(eDataIso),
    );
    return NextResponse.json({ oggi, giorni }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cronoprogramma non disponibile.' },
      { status: 500 },
    );
  }
}
