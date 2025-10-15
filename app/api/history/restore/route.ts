import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Body:
 * {
 *   table: 'calendar_days' | 'assignments',
 *   id: 'uuid riga originale',
 *   version_id?: 'uuid versione specifica' // se assente prende l'ultima
 * }
 */
export async function POST(req: NextRequest) {
  const { table, id, version_id } = await req.json();
  if (!['calendar_days','assignments'].includes(table)) {
    return NextResponse.json({ error: 'tabella non permessa' }, { status: 400 });
  }
  const histTable = table + '_history';

  // 1) leggi snapshot
  const sel = supabaseAdmin.from(histTable)
    .select('snapshot, version_id')
    .eq('id', id)
    .order('created_at', { ascending: false })
    .limit(1);
  const { data: histData, error: histErr } = version_id
    ? await supabaseAdmin.from(histTable).select('snapshot, version_id').eq('version_id', version_id).limit(1)
    : await sel;

  if (histErr || !histData || !histData[0]) {
    return NextResponse.json({ error: 'versione non trovata' }, { status: 404 });
  }
  const snapshot = histData[0].snapshot;

  // 2) ripristina (upsert by id)
  const { error: upErr } = await supabaseAdmin.from(table).upsert({
    ...snapshot,
    updated_at: new Date().toISOString()
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // 3) audit esplicito
  await supabaseAdmin.rpc('log_audit', {
    p_actor: (await supabaseAdmin.auth.getUser()).data.user?.id ?? null,
    p_action: `${table}_restore`,
    p_entity: table,
    p_entity_id: id,
    p_payload: { restored_from: histData[0].version_id }
  });

  return NextResponse.json({ ok: true, restored_from: histData[0].version_id });
}
