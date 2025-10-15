import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // body: { day_id, staff_id, territory_id?, activity_id?, reperibile?, notes? }
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .insert({ ...body, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, assignment: data });
}
