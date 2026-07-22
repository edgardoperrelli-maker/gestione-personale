import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { rigeneraPiano } from '@/lib/interventi/rigeneraPiano';

export const runtime = 'nodejs';

/**
 * POST /api/mappa/piani/interventi — rigenera i record `interventi` dal piano E risincronizza
 * le voci dei rapportini ESISTENTI: i nuovi ODL aggiunti in pianificazione compaiono subito nel
 * rapportino dell'operatore (col badge "nuovo") e il collegamento voce↔intervento resta integro.
 * Body: { pianoId }. Idempotente: gli interventi terminali (completato/annullato) sono preservati;
 * gli altri (created_from_mappa) rigenerati dai task correnti. I rapportini INVIATI non vengono
 * toccati (la riapertura resta nel flusso Genera/Conferma); un eventuale conflitto del sync NON
 * fa fallire la creazione degli interventi (ritornato come rapportiniWarning).
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { pianoId } = (await req.json().catch(() => ({}))) as { pianoId?: string };
  if (!pianoId) return NextResponse.json({ error: 'pianoId mancante.' }, { status: 400 });

  const res = await rigeneraPiano(supabaseAdmin, pianoId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({
    creati: res.creati,
    preservati: res.preservati,
    scartati: res.scartati,
    odlBloccati: res.odlBloccati,
    odlBloccatiDettagli: res.odlBloccatiDettagli,
    rapportiniSync: res.rapportiniSync,
    rapportiniWarning: res.rapportiniWarning,
  });
}
