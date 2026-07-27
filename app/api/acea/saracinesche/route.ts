import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaDichiarazioni, caricaOrdiniSostituzione } from '@/lib/acea/caricaSaracinesche';
import { statiSaracinesche, valoreDaRichiedere, type Famiglia } from '@/lib/acea/saracinesche';

export const runtime = 'nodejs';

/**
 * GET /api/acea/saracinesche?famiglia=dunning|massive
 *
 * I tre stati del ciclo, tutti derivati: nessuna tabella, nessun campo da tenere aggiornato a mano.
 * Il filtro per famiglia si applica dopo l'aggancio — la funzione pura se ne occupa — così una
 * saracinesca coperta da un ordine dell'altra famiglia non finisce fra quelle da richiedere.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const f = new URL(req.url).searchParams.get('famiglia');
    const famiglia: Famiglia | null = f === 'dunning' || f === 'massive' ? f : null;

    const [dichiarazioni, ordini] = await Promise.all([
      caricaDichiarazioni(supabaseAdmin),
      caricaOrdiniSostituzione(supabaseAdmin),
    ]);

    const esito = statiSaracinesche({ dichiarazioni, ordini, famiglia });

    // Onestà del dato: senza ordini di sostituzione nel registro la copertura non è calcolabile e
    // «da richiedere» coinciderebbe con «fatte» — un falso allarme da decine di migliaia di euro.
    // Si dice, invece di lasciar leggere un numero che non significa niente.
    const attendibile = ordini.length > 0;

    return NextResponse.json(
      {
        fatte: esito.fatte,
        coperte: esito.coperte,
        daRichiedere: esito.daRichiedere,
        daEsitare: esito.daEsitare,
        valoreDaRichiedere: valoreDaRichiedere(esito.daRichiedere),
        ordiniSostituzioneNelRegistro: ordini.length,
        attendibile,
        dichiarazioni: esito.dichiarazioni,
        ordiniAperti: esito.ordiniAperti,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura saracinesche.' },
      { status: 500 },
    );
  }
}
