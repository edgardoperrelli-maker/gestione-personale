import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { richiestaIdValido } from '@/lib/offline/idRichiesta';

export const runtime = 'nodejs';

/** Interventi "+" creati per un task-via (parent_voce_id), per il rapportino del token. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; voceId: string }> }) {
  const { token, voceId } = await params;

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // `voceId` (dalla form) può essere l'UUID del voce-gruppo O il suo task_id (es. "row-9"/
  // "manual-…"). I figli sono legati per parent_voce_id = UUID del voce (vedi intervento-manuale).
  // Risolviamo SEMPRE all'UUID: per id se è UUID, altrimenti per task_id su questo rapportino.
  // Senza questo, aprendo il gruppo i "+" non comparivano (e parent_voce_id è UUID → confrontarlo
  // con un task_id non-UUID dava errore).
  let parentUuid: string | null = richiestaIdValido(voceId) ? voceId : null;
  if (!parentUuid) {
    const { data: vRows } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id')
      .eq('rapportino_id', rap.id)
      .eq('task_id', voceId)
      .limit(1);
    parentUuid = ((vRows ?? [])[0] as { id: string } | undefined)?.id ?? null;
  }
  if (!parentUuid) return NextResponse.json({ interventi: [] });

  const { data, error } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, dati_correnti, created_at')
    .eq('rapportino_id', rap.id)
    .eq('parent_voce_id', parentUuid)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = ((data ?? []) as Array<{ id: string; stato: string; dati_correnti: { anagrafica?: Record<string, unknown> } }>).map((r) => ({
    id: r.id,
    stato: r.stato,
    matricola: String(r.dati_correnti?.anagrafica?.matricola ?? ''),
    via: String(r.dati_correnti?.anagrafica?.via ?? ''),
  }));
  return NextResponse.json({ interventi: out });
}
