import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const { history_id } = await req.json();
  if (!history_id) return NextResponse.json({ error: 'history_id required' }, { status: 400 });

  const { data: h, error: he } = await sb
    .from('calendar_days_history')
    .select('calendar_day_id, new_record, prev_record, version')
    .eq('id', history_id).single();
  if (he) return NextResponse.json({ error: he.message }, { status: 400 });

  const snap = (h.new_record ?? h.prev_record) as any;
  if (!snap) return NextResponse.json({ error: 'empty snapshot' }, { status: 400 });

  const { id, updated_at, version, ...fields } = snap;

  const { data, error } = await sb
    .from('calendar_days')
    .update({ ...fields, updated_at: new Date().toISOString(), version: h.version + 1 })
    .eq('id', h.calendar_day_id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, row: data });
}
