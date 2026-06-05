import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';

export const runtime = 'nodejs';

/**
 * POST /api/interventi/rigenera-giorno?data=YYYY-MM-DD  (admin)
 * Ricostruisce gli interventi del giorno dai task salvati dei piani
 * (`mappa_piani_operatori.tasks`) tramite `ensureInterventiForPiano`:
 * ricrea gli "assegnati" dai task correnti e PRESERVA i completati/annullati.
 * Serve a ripristinare interventi cancellati per errore (es. dedup troppo
 * aggressiva): i task sono la fonte di verità e non vengono toccati.
 * Idempotente: rilanciarlo su piani integri non cambia nulla.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' }, { status: 400 });
  }

  const { data: piani, error } = await supabaseAdmin
    .from('mappa_piani')
    .select('id')
    .eq('data', data);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let creati = 0;
  let preservati = 0;
  let scartati = 0;
  const dettaglio: Array<{ pianoId: string; creati: number; preservati: number; scartati: number; error?: string }> = [];

  for (const p of (piani ?? []) as Array<{ id: string }>) {
    const r = await ensureInterventiForPiano(supabaseAdmin, p.id);
    creati += r.creati;
    preservati += r.preservati;
    scartati += r.scartati;
    dettaglio.push({ pianoId: p.id, creati: r.creati, preservati: r.preservati, scartati: r.scartati, error: r.error });
  }

  return NextResponse.json({ ok: true, piani: (piani ?? []).length, creati, preservati, scartati, dettaglio });
}
