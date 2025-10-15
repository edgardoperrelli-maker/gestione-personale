import { NextRequest, NextResponse } from 'next/server';
import { supabaseBrowser } from '@/lib/supabaseBrowser'; // se usi route handler server puro, passa a supabaseAdmin

export async function POST(req: NextRequest) {
  const { day, note } = await req.json();
  // upsert by day
  const sb = (await import('@/lib/supabaseAdmin')).supabaseAdmin;
  const { data, error } = await sb
    .from('calendar_days')
    .upsert({ day, note, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, day: data });
}
