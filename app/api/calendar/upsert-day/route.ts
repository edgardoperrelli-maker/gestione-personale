import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const { id, day, note, user_id, version } = await req.json();

  if (id && typeof version === 'number') {
  // 1) UPDATE: migra legacy settando SEMPRE user_id
const { data: upd, error: updErr } = await sb
  .from('calendar_days')
.update({
  note,
  user_id, // popola legacy
  updated_at: new Date().toISOString(),
  version: (version ?? 1) + 1
})
.eq('id', id)                // rimuovi filtro su user_id
.eq('version', version)

  .single();

if (!updErr && upd) return NextResponse.json({ ok: true, row: upd });

// 2) INSERT protetta
const { data: ins, error: insErr } = await sb
  .from('calendar_days')
  .insert([{ day, note, user_id }])
  .select()
  .single();

if (!insErr) return NextResponse.json({ ok: true, row: ins });

// 3) Conflitto → stato corrente
const { data: current } = await sb
  .from('calendar_days')
  .select('*')
  .eq('day', day)
  .single();

return NextResponse.json({ ok: false, conflict: true, current }, { status: 409 });

    if (!updErr && upd) return NextResponse.json({ ok: true, row: upd });
  }

  const { data: ins, error: insErr } = await sb
    .from('calendar_days')
    .insert([{ day, note, user_id }])
    .select().single();
  if (!insErr) return NextResponse.json({ ok: true, row: ins });

  const { data: current } = await sb
    .from('calendar_days')
    .select('*').eq('user_id', user_id).eq('day', day).single();
  return NextResponse.json({ ok: false, conflict: true, current }, { status: 409 });
}
