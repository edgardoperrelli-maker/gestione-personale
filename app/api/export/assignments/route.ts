import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function csvEscape(v: unknown) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Parametri from/to non validi (YYYY-MM-DD)' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-side
  if (!url || !key) {
    return NextResponse.json({ error: 'Env Supabase mancanti' }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1) prendo i giorni
  const dRes = await sb
    .from('calendar_days')
    .select('id, day')
    .gte('day', from)
    .lte('day', to)
    .order('day', { ascending: true });

  if (dRes.error) {
    return NextResponse.json({ error: dRes.error.message }, { status: 500 });
  }
  const dayMap = new Map<string, string>();
  const dayIds = (dRes.data ?? []).map(r => {
    dayMap.set(r.id, r.day);
    return r.id;
  });

  if (!dayIds.length) {
    // CSV vuoto ma con intestazione
    const header = 'Data,Operatore,Attività,Territorio,Reperibile,Note\n';
    return new NextResponse(header, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="assignments_${from}_to_${to}.csv"`,
      },
    });
  }

  // 2) prendo le assignments nel range
  const aRes = await sb
    .from('assignments')
    .select(`
      id, day_id, reperibile, notes,
      staff:staff_id ( display_name ),
      activity:activity_id ( name ),
      territory:territory_id ( name )
    `)
    .in('day_id', dayIds)
    .order('created_at');

  if (aRes.error) {
    return NextResponse.json({ error: aRes.error.message }, { status: 500 });
  }

  const rows = (aRes.data ?? []).map((r: any) => ({
    day: dayMap.get(r.day_id) ?? '',
    staff: r.staff?.display_name ?? '',
    activity: r.activity?.name ?? '',
    territory: r.territory?.name ?? '',
    reperibile: r.reperibile ? 'SI' : 'NO',
    notes: r.notes ?? '',
  }));

  const header = 'Data,Operatore,Attività,Territorio,Reperibile,Note';
  const body = rows
    .map(r => [
      csvEscape(r.day),
      csvEscape(r.staff),
      csvEscape(r.activity),
      csvEscape(r.territory),
      csvEscape(r.reperibile),
      csvEscape(r.notes),
    ].join(','))
    .join('\n');

  const csv = header + '\n' + body + (body ? '\n' : '');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="assignments_${from}_to_${to}.csv"`,
    },
  });
}
