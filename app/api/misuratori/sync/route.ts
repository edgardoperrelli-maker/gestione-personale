import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { isRimozioneTipo } from '@/lib/interventi/rimozioneMisuratore';
import { righeMisuratoriDaRimuovere } from '@/lib/interventi/misuratoriDaRimuovere';
import { ymdLocal } from '@/utils/date-it';

export const runtime = 'nodejs';

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // 1. Interventi che QUALIFICANO oggi come rimozione misuratore ACEA positiva.
  //    NB: la matricola NON è filtrata qui. L'hook di invio inserisce basandosi su
  //    rapportino_voci.matricola (dato compilato dall'operatore), che è una colonna
  //    DIVERSA da interventi.matricola_contatore: filtrarla rimuoverebbe record
  //    legittimi. La matricola è già garantita non nulla sui record esistenti
  //    (vincolo NOT NULL) e viene ri-controllata su voci.matricola nel solo
  //    ramo di inserimento.
  // Pre-filtro DB ampio (`%rim%`, superset) + classificazione precisa lato JS:
  // intercetta sia "Rimozione …" sia l'abbreviazione ACEA "Rim Mis/Mod radio…".
  const { data: interventiRaw, error: errInt } = await supabaseAdmin
    .from('interventi')
    .select('id, data, chiuso_at, intervento_tipo')
    .eq('committente', 'acea')
    .ilike('intervento_tipo', '%rim%')
    .eq('esito', 'eseguito_positivo');
  if (errInt) return NextResponse.json({ error: errInt.message }, { status: 500 });
  const interventi = (interventiRaw ?? []).filter((i) => isRimozioneTipo(i.intervento_tipo));

  const qualifyingIds = new Set((interventi ?? []).map(i => i.id));

  // Data ESECUZIONE = momento reale di chiusura (chiuso_at) in fuso Europe/Rome.
  // Fallback alla data pianificata dell'intervento se chiuso_at è assente.
  const execDateMap = new Map(
    (interventi ?? []).map(i => [i.id, i.chiuso_at ? ymdLocal(new Date(i.chiuso_at)) : i.data]),
  );

  // 2. Record già presenti in tabella.
  const { data: existing, error: errExist } = await supabaseAdmin
    .from('misuratori_rimossi')
    .select('id, intervento_id, data_esecuzione');
  if (errExist) return NextResponse.json({ error: errExist.message }, { status: 500 });

  const existingIds = new Set((existing ?? []).map(r => r.intervento_id).filter(Boolean));

  // 3. RIMOZIONE: ogni riga del registro il cui intervento non qualifica più come
  //    rimozione misuratore ACEA positiva va eliminata, A PRESCINDERE dallo stato
  //    logistico. Così il Ricalcola ripulisce anche le righe GIÀ ENTRATE e poi
  //    avanzate (scaricato/verificato/consegnato): interventi corretti da positivo
  //    a negativo e rimozioni riclassificate come "impianto abusivo", che non
  //    devono mai restare nel registro. Il guardrail "set qualificante vuoto →
  //    non rimuovere nulla" è dentro righeMisuratoriDaRimuovere.
  let rimossi = 0;
  const daRimuovere = righeMisuratoriDaRimuovere(existing ?? [], qualifyingIds);
  if (daRimuovere.length > 0) {
    const { data: deleted, error: errDel } = await supabaseAdmin
      .from('misuratori_rimossi')
      .delete()
      .in('id', daRimuovere)
      .select('id');
    if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });
    rimossi = deleted?.length ?? 0;
  }

  // 3b. CORREZIONE DATA: record (in QUALSIASI stato) il cui intervento qualifica ma
  //     la cui data_esecuzione registrata diverge da quella reale (chiuso_at).
  //     A differenza della rimozione, correggere la data è solo un fix di un campo
  //     descrittivo: non altera il flusso logistico, quindi si applica anche agli
  //     stati avanzati. Aggiornamento batch per data target (poche date distinte).
  const daAggiornare = (existing ?? []).filter(r =>
    r.intervento_id &&
    qualifyingIds.has(r.intervento_id) &&
    execDateMap.get(r.intervento_id) &&
    r.data_esecuzione !== execDateMap.get(r.intervento_id),
  );
  let aggiornati = 0;
  if (daAggiornare.length > 0) {
    const idsByDate = new Map<string, string[]>();
    for (const r of daAggiornare) {
      const target = execDateMap.get(r.intervento_id)!;
      const bucket = idsByDate.get(target) ?? [];
      bucket.push(r.id);
      idsByDate.set(target, bucket);
    }
    for (const [date, ids] of idsByDate) {
      const { data: updated, error: errUpd } = await supabaseAdmin
        .from('misuratori_rimossi')
        .update({ data_esecuzione: date })
        .in('id', ids)
        .select('id');
      if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });
      aggiornati += updated?.length ?? 0;
    }
  }

  // 4. INSERIMENTO: interventi qualificanti non ancora registrati.
  const nuoviIds = (interventi ?? [])
    .map(i => i.id)
    .filter(id => !existingIds.has(id));

  if (nuoviIds.length === 0) return NextResponse.json({ ok: true, inseriti: 0, rimossi, aggiornati });

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

  // 7. Costruisci payload e inserisci (gate finale su voci.matricola, come l'hook).
  const toInsert = (voci ?? [])
    .filter(v => v.intervento_id && v.matricola && v.matricola.trim())
    .map(v => ({
      intervento_id:   v.intervento_id,
      rapportino_id:   v.rapportino_id ?? null,
      odl:             v.odl ?? null,
      data_esecuzione: execDateMap.get(v.intervento_id)!,
      esecutore:       rapMap[v.rapportino_id ?? ''] ?? null,
      indirizzo:       v.via ?? null,
      comune:          v.comune ?? null,
      matricola:       v.matricola.trim(),
      pdr:             v.pdr ?? null,
    }));

  if (toInsert.length === 0) return NextResponse.json({ ok: true, inseriti: 0, rimossi, aggiornati });

  const { error: errIns } = await supabaseAdmin
    .from('misuratori_rimossi')
    .upsert(toInsert, { onConflict: 'intervento_id', ignoreDuplicates: true });
  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 });

  return NextResponse.json({ ok: true, inseriti: toInsert.length, rimossi, aggiornati });
}
