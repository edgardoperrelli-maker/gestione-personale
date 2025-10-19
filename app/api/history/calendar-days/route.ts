import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id'); // calendar_day_id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await sb
    .from('calendar_days_history')
    .select('id, action, version, changed_by, changed_at, prev_record, new_record, created_at, op, actor')
    .eq('calendar_day_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data });
}
