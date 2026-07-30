// Stato di approvazione delle voci del rapportino, in forma minima.
//
// Serve a una cosa sola: l'operatore AcquaLatina è FERMO sul posto e aspetta che l'ufficio
// gli assegni il misuratore che ha appena scansionato. Finché la voce è sospesa non può
// lavorare, e senza questo endpoint scoprirebbe l'assegnazione solo ricaricando a caso.
//
// Volutamente magrissimo: due colonne, nessun join, nessuna foto. Viene chiamato ogni ~12
// secondi da un telefono in campo, e solo finché c'è davvero qualcosa in attesa.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, approvazione_stato')
    .eq('rapportino_id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ voci: data ?? [] });
}
