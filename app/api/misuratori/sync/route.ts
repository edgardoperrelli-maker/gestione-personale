import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // 1. IDs già presenti
  const { data: existing } = await supabaseAdmin
    .from('misuratori_rimossi')
    .select('intervento_id');
  const existingIds = new Set((existing ?? []).map(r => r.intervento_id).filter(Boolean));

  // 2. Interventi qualificanti non ancora registrati
  const { data: interventi, error: errInt } = await supabaseAdmin
    .from('interventi')
    .select('id, data, matricola_contatore')
    .eq('committente', 'acea')
    .eq('voce', 12)
    .eq('esito', 'eseguito_positivo')
    .not('matricola_contatore', 'is', null)
    .neq('matricola_contatore', '');
  if (errInt) return NextResponse.json({ error: errInt.message }, { status: 500 });

  const nuoviIds = (interventi ?? [])
    .map(i => i.id)
    .filter(id => !existingIds.has(id));

  if (nuoviIds.length === 0) return NextResponse.json({ ok: true, inseriti: 0 });

  // 3. Recupera dati voce per questi interventi
  const { data: voci, error: errVoci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id, matricola, pdr, odl, via, comune, rapportino_id')
    .in('intervento_id', nuoviIds);
  if (errVoci) return NextResponse.json({ error: errVoci.message }, { status: 500 });

  // 4. Recupera staff_name dai rapportini
  const rapIds = [...new Set((voci ?? []).map(v => v.rapportino_id).filter(Boolean))];
  const { data: rapportini } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_name')
    .in('id', rapIds);

  const rapMap = Object.fromEntries((rapportini ?? []).map(r => [r.id, r.staff_name]));
  const intDataMap = Object.fromEntries((interventi ?? []).map(i => [i.id, i.data]));

  // 5. Costruisci payload e inserisci
  const toInsert = (voci ?? [])
    .filter(v => v.intervento_id && v.matricola && v.matricola.trim())
    .map(v => ({
      intervento_id:   v.intervento_id,
      rapportino_id:   v.rapportino_id ?? null,
      odl:             v.odl ?? null,
      data_esecuzione: intDataMap[v.intervento_id],
      esecutore:       rapMap[v.rapportino_id ?? ''] ?? null,
      indirizzo:       v.via ?? null,
      comune:          v.comune ?? null,
      matricola:       v.matricola.trim(),
      pdr:             v.pdr ?? null,
    }));

  if (toInsert.length === 0) return NextResponse.json({ ok: true, inseriti: 0 });

  const { error: errIns } = await supabaseAdmin
    .from('misuratori_rimossi')
    .upsert(toInsert, { onConflict: 'intervento_id', ignoreDuplicates: true });
  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 });

  return NextResponse.json({ ok: true, inseriti: toInsert.length });
}
