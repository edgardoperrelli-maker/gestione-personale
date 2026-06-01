import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/apiAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { searchParams } = new URL(req.url);
    const pianoId = searchParams.get('pianoId');
    const staffId = searchParams.get('staffId');
    if (!pianoId || !staffId) {
      return NextResponse.json({ error: 'pianoId e staffId obbligatori' }, { status: 400 });
    }

    const { data: piano } = await supabaseAdmin
      .from('mappa_piani').select('data').eq('id', pianoId).maybeSingle();
    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });

    // 1) Elimina il rapportino dell'operatore (cascade su voci → link non più valido)
    await supabaseAdmin.from('rapportini').delete().eq('piano_id', pianoId).eq('staff_id', staffId);

    // 2) Elimina la riga operatore del piano (operatore + suoi interventi)
    const { error: eOp } = await supabaseAdmin
      .from('mappa_piani_operatori').delete().eq('piano_id', pianoId).eq('staff_id', staffId);
    if (eOp) throw new Error(eOp.message);

    // 3) Azzera il contatore nel cronoprogramma
    await supabaseAdmin
      .from('mappa_distribuzioni')
      .update({ task_count: 0, updated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .eq('data', (piano as { data: string }).data);

    // 4) Se non restano operatori → elimina il piano
    const { count } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .select('staff_id', { count: 'exact', head: true })
      .eq('piano_id', pianoId);
    let pianoDeleted = false;
    if ((count ?? 0) === 0) {
      await supabaseAdmin.from('mappa_piani').delete().eq('id', pianoId);
      pianoDeleted = true;
    }

    return NextResponse.json({ ok: true, pianoDeleted });
  } catch (err: any) {
    console.error('[DELETE /api/mappa/piani/operatore]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
