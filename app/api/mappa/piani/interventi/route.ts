import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { taskToIntervento } from '@/lib/interventi/taskToIntervento';
import type { Task } from '@/utils/routing/types';

export const runtime = 'nodejs';

/**
 * POST /api/mappa/piani/interventi — crea/aggiorna i record `interventi` dal piano.
 * Body: { pianoId }. Idempotente: gli interventi già completati/annullati del piano
 * vengono preservati; gli altri (created_from_mappa) sono rigenerati dai task correnti.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { pianoId } = (await req.json().catch(() => ({}))) as { pianoId?: string };
  if (!pianoId) return NextResponse.json({ error: 'pianoId mancante.' }, { status: 400 });

  const { data: pianoRow } = await supabaseAdmin
    .from('mappa_piani')
    .select('id, data, territorio')
    .eq('id', pianoId)
    .maybeSingle();
  const piano = pianoRow as { id: string; data: string; territorio: string | null } | null;
  if (!piano) return NextResponse.json({ error: 'Piano non trovato.' }, { status: 404 });

  // territorio del piano (salvato come nome) → territory_id, per il filtro torre
  let territorioId: string | null = null;
  if (piano.territorio) {
    const { data: terr } = await supabaseAdmin
      .from('territories')
      .select('id')
      .eq('name', piano.territorio)
      .maybeSingle();
    territorioId = (terr as { id: string } | null)?.id ?? null;
  }

  const { data: opRows } = await supabaseAdmin
    .from('mappa_piani_operatori')
    .select('staff_id, tasks')
    .eq('piano_id', pianoId);
  const operatori = (opRows ?? []) as Array<{ staff_id: string; tasks: Task[] | null }>;

  // Interventi già esistenti del piano: preserva i terminali (completato/annullato).
  const { data: existing } = await supabaseAdmin
    .from('interventi')
    .select('id, odl, stato')
    .eq('piano_id', pianoId)
    .eq('created_from_mappa', true);
  const esistenti = (existing ?? []) as Array<{ id: string; odl: string | null; stato: string }>;
  const terminali = esistenti.filter((e) => e.stato === 'completato' || e.stato === 'annullato');
  const odlTerminali = new Set(terminali.map((e) => e.odl).filter(Boolean));
  const idsDaEliminare = esistenti.filter((e) => !(e.stato === 'completato' || e.stato === 'annullato')).map((e) => e.id);

  if (idsDaEliminare.length) {
    const { error } = await supabaseAdmin.from('interventi').delete().in('id', idsDaEliminare);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = [];
  for (const op of operatori) {
    for (const t of op.tasks ?? []) {
      const rec = taskToIntervento(t, {
        committente: 'acea',
        data: piano.data,
        staffId: op.staff_id,
        pianoId,
        territorioId,
      });
      if (rec.odl && odlTerminali.has(rec.odl)) continue; // già chiuso → non duplicare
      rows.push(rec);
    }
  }

  if (rows.length) {
    const { error } = await supabaseAdmin.from('interventi').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ creati: rows.length, preservati: terminali.length });
}
