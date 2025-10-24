import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const { id, day, note, user_id, version } = await req.json();

  // UPDATE ottimistico quando arrivano id+version
  if (id && typeof version === 'number') {
    const { data: upd, error: updErr } = await sb
      .from('calendar_days')
      .update({
        note,
        user_id, // migrazione legacy
        updated_at: new Date().toISOString(),
        version: (version ?? 1) + 1,
      })
      .eq('id', id)
      .eq('version', version)
      .single();

    if (!updErr && upd) return NextResponse.json({ ok: true, row: upd });

    // se fallisce l'update, prova insert oppure ritorna current per conflitto
    const { data: ins, error: insErr } = await sb
      .from('calendar_days')
      .insert([{ day, note, user_id }])
      .select()
      .single();

    if (!insErr && ins) return NextResponse.json({ ok: true, row: ins });

    const { data: current } = await sb
      .from('calendar_days')
      .select('*')
      .eq('day', day)            // <<< NON filtrare per user_id
      .single();

    return NextResponse.json({ ok: false, conflict: true, current }, { status: 409 });
  }

  // CREATE se non ci sono id/version
  const { data: ins, error: insErr } = await sb
    .from('calendar_days')
    .insert([{ day, note, user_id }])
    .select()
    .single();

  if (!insErr && ins) return NextResponse.json({ ok: true, row: ins });

  // Conflitto: ritorna sempre il record esistente per quel day
  const { data: current } = await sb
    .from('calendar_days')
    .select('*')
    .eq('day', day)              // <<< NON filtrare per user_id
    .single();

  return NextResponse.json({ ok: false, conflict: true, current }, { status: 409 });
}
