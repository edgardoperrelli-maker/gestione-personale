import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';

export const runtime = 'nodejs';

/**
 * POST /api/mappa/piani/interventi — crea/aggiorna i record `interventi` dal piano.
 * Body: { pianoId }. Idempotente: gli interventi terminali (completato/annullato) del
 * piano vengono preservati; gli altri (created_from_mappa) sono rigenerati dai task correnti.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { pianoId } = (await req.json().catch(() => ({}))) as { pianoId?: string };
  if (!pianoId) return NextResponse.json({ error: 'pianoId mancante.' }, { status: 400 });

  const res = await ensureInterventiForPiano(supabaseAdmin, pianoId);
  if (res.error) {
    const status = res.error === 'Piano non trovato.' ? 404 : 500;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ creati: res.creati, preservati: res.preservati, scartati: res.scartati });
}
