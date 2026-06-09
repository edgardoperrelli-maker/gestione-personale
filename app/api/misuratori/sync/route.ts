import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // 1. Interventi che QUALIFICANO oggi come rimozione misuratore ACEA positiva.
  //    NB: la matricola NON è filtrata qui. L'hook di invio inserisce basandosi su
  //    rapportino_voci.matricola (dato compilato dall'operatore), che è una colonna
  //    DIVERSA da interventi.matricola_contatore: filtrare su quest'ultima
  //    rimuoverebbe record legittimi. La matricola è già garantita non nulla sui
  //    record esistenti (vincolo NOT NULL) e viene ri-controllata su voci.matricola
  //    nel solo ramo di inserimento.
  const { data: interventi, error: errInt } = await supabaseAdmin
    .from('interventi')
    .select('id, data')
    .eq('committente', 'acea')
    .ilike('intervento_tipo', '%rimozione%')
    .eq('esito', 'eseguito_positivo');
  if (errInt) return NextResponse.json({ error: errInt.message }, { status: 500 });

  const qualifyingIds = new Set((interventi ?? []).map(i => i.id));

  // 2. Record già presenti in tabella (id, intervento, stato).
  const { data: existing, error: errExist } = await supabaseAdmin
    .from('misuratori_rimossi')
    .select('id, intervento_id, stato');
  if (errExist) return NextResponse.json({ error: errExist.message }, { status: 500 });

  const existingIds = new Set((existing ?? []).map(r => r.intervento_id).filter(Boolean));

  // 3. RIMOZIONE: record ancora in 'da_consegnare_deposito' il cui intervento non
  //    qualifica più (es. rapportino corretto da positivo a negativo). Gli stati
  //    avanzati restano intatti: il misuratore è già nel flusso logistico fisico.
  //    Guardrail: se il set qualificante è vuoto (query degenerata / DB di test)
  //    NON si cancella nulla, per evitare uno svuotamento di massa accidentale.
  let rimossi = 0;
  if (qualifyingIds.size > 0) {
    const daRimuovere = (existing ?? [])
      .filter(r => r.stato === 'da_consegnare_deposito' && r.intervento_id && !qualifyingIds.has(r.intervento_id))
      .map(r => r.id);
    if (daRimuovere.length > 0) {
      const { data: deleted, error: errDel } = await supabaseAdmin
        .from('misuratori_rimossi')
        .delete()
        .in('id', daRimuovere)
        .eq('stato', 'da_consegnare_deposito') // difensivo: non toccare record avanzati nel frattempo
        .select('id');
      if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });
      rimossi = deleted?.length ?? 0; // conteggio reale post-filtro difensivo
    }
  }

  // 4. INSERIMENTO: interventi qualificanti non ancora registrati.
  const nuoviIds = (interventi ?? [])
    .map(i => i.id)
    .filter(id => !existingIds.has(id));

  if (nuoviIds.length === 0) return NextResponse.json({ ok: true, inseriti: 0, rimossi });

  // 5. Recupera dati voce per questi interventi.
  const { data: voci, error: errVoci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id, matricola, pdr, odl, via, comune, rapportino_id')
    .in('intervento_id', nuoviIds);
  if (errVoci) return NextResponse.json({ error: errVoci.message }, { status: 500 });

  // 6. Recupera staff_name dai rapportini.
  const rapIds = [...new Set((voci ?? []).map(v => v.rapportino_id).filter(Boolean))];
  const { data: rapportini } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_name')
    .in('id', rapIds);

  const rapMap = Object.fromEntries((rapportini ?? []).map(r => [r.id, r.staff_name]));
  const intDataMap = Object.fromEntries((interventi ?? []).map(i => [i.id, i.data]));

  // 7. Costruisci payload e inserisci (gate finale su voci.matricola, come l'hook).
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

  if (toInsert.length === 0) return NextResponse.json({ ok: true, inseriti: 0, rimossi });

  const { error: errIns } = await supabaseAdmin
    .from('misuratori_rimossi')
    .upsert(toInsert, { onConflict: 'intervento_id', ignoreDuplicates: true });
  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 });

  return NextResponse.json({ ok: true, inseriti: toInsert.length, rimossi });
}
