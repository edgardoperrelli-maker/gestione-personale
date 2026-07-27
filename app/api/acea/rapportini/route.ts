import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { sincronizzaRapportiniAcea } from '@/lib/acea/sincronizzaRapportiniAcea';
import { riepilogoEsiti } from '@/lib/acea/vociRapportino';

export const runtime = 'nodejs';

type Corpo = {
  data?: string;
  staffIds?: string[];
  /** Riapre i rapportini già consegnati che devono ricevere voci nuove. */
  confermaRiaperture?: boolean;
};

/**
 * POST /api/acea/rapportini — genera i rapportini del giorno per gli interventi ACEA pianificati.
 *
 * La prima chiamata è il passaggio sicuro: crea e aggiunge dove si può, e per i rapportini già
 * consegnati si ferma restituendo `richiede_riapertura`. L'admin vede riga per riga cosa è
 * successo e, se vuole riaprire, richiama con `confermaRiaperture`.
 *
 * È idempotente: rilanciarla non duplica niente (le voci ACEA sono agganciate al loro intervento),
 * quindi si può premere il pulsante ogni volta che si aggiunge lavoro a un giorno già generato —
 * che è esattamente il caso delle attivazioni assegnate in giornata.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const corpo = (await req.json()) as Corpo;
    const data = String(corpo.data ?? '').trim();
    const staffIds = Array.isArray(corpo.staffIds)
      ? corpo.staffIds.map((s) => String(s)).filter(Boolean)
      : undefined;

    const esito = await sincronizzaRapportiniAcea(supabaseAdmin, {
      data,
      attoreId: auth.user.id,
      staffIds,
      confermaRiaperture: corpo.confermaRiaperture === true,
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: esito.status });
    }
    return NextResponse.json(
      { esiti: esito.esiti, avvisi: esito.avvisi, riepilogo: riepilogoEsiti(esito.esiti) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore generazione rapportini.' },
      { status: 500 },
    );
  }
}
