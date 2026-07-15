import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/**
 * Dettaglio (JSONB, ~27KB medi, fino a 80KB) di un singolo giro agente.
 * Caricato on-demand quando l'utente espande una card nello storico: la lista
 * dei giri NON scarica più `dettaglio` per tutte le 30 righe (era il collo di
 * bottiglia del modulo — 93ms medi a chiamata, martellato dal polling).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('agente_run')
    .select('dettaglio')
    .eq('id', id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Giro non trovato.' }, { status: 404 });
  }

  return NextResponse.json({ dettaglio: data.dettaglio }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
