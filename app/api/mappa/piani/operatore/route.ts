import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/apiAuth';
import { attoreDa, registraAzione } from '@/lib/audit/registra';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  // Fuori dal try: al registro serve sapere CHI ha tentato l'operazione anche quando fallisce.
  let attore = attoreDa(null);
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    attore = attoreDa(auth.user);
    const { searchParams } = new URL(req.url);
    const pianoId = searchParams.get('pianoId');
    const staffId = searchParams.get('staffId');
    if (!pianoId || !staffId) {
      return NextResponse.json({ error: 'pianoId e staffId obbligatori' }, { status: 400 });
    }

    const { data: piano } = await supabaseAdmin
      .from('mappa_piani').select('data').eq('id', pianoId).maybeSingle();
    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });

    // Cosa si porta via questa rimozione: va letto PRIMA, dopo le delete non esiste più.
    const [{ data: rapPrima }, { count: nInterventi }, { count: nCompletati }] = await Promise.all([
      supabaseAdmin
        .from('rapportini').select('id, staff_name, stato, submitted_at')
        .eq('piano_id', pianoId).eq('staff_id', staffId),
      supabaseAdmin
        .from('interventi').select('id', { count: 'exact', head: true })
        .eq('piano_id', pianoId).eq('staff_id', staffId),
      supabaseAdmin
        .from('interventi').select('id', { count: 'exact', head: true })
        .eq('piano_id', pianoId).eq('staff_id', staffId).eq('stato', 'completato'),
    ]);
    const rapportiniRimossi = (rapPrima ?? []) as Array<{
      id: string; staff_name: string | null; stato: string; submitted_at: string | null;
    }>;

    // 1) Elimina il rapportino dell'operatore (cascade su voci → link non più valido)
    await supabaseAdmin.from('rapportini').delete().eq('piano_id', pianoId).eq('staff_id', staffId);

    // 2) Elimina la riga operatore del piano
    const { error: eOp } = await supabaseAdmin
      .from('mappa_piani_operatori').delete().eq('piano_id', pianoId).eq('staff_id', staffId);
    if (eOp) throw new Error(eOp.message);

    // 2b) Elimina gli interventi di questo operatore in questo piano, così spariscono dalla
    // torre (interventi.piano_id ha ON DELETE SET NULL: serve cancellarli esplicitamente).
    // I TERMINALI restano: un completato è lavoro consegnato — cancellarlo riaprirebbe la
    // riga di registro acqualatina e lascerebbe orfana la rimozione misuratore. `nCompletati`
    // qui sopra continua a dire nel log quanti ne sopravvivono.
    //
    // E restano anche le righe del REGISTRO (`created_from_mappa=false`, commessa/«+»): non
    // nate dai task del piano, la loro fonte di verità è il registro — qui al più si
    // sganciano (se il piano sparisce, la FK azzera `piano_id`), mai si distruggono.
    const { error: eInt } = await supabaseAdmin
      .from('interventi')
      .delete()
      .eq('piano_id', pianoId)
      .eq('staff_id', staffId)
      .eq('created_from_mappa', true)
      .not('stato', 'in', '(completato,annullato)');
    if (eInt) throw new Error(eInt.message);

    // 3) Azzera il contatore nel cronoprogramma
    await supabaseAdmin
      .from('mappa_distribuzioni')
      .update({ task_count: 0, updated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .eq('data', (piano as { data: string }).data);

    // 4) Se non restano operatori → elimina il piano
    const { count } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .select('staff_id', { count: 'exact', head: true })
      .eq('piano_id', pianoId);
    let pianoDeleted = false;
    if ((count ?? 0) === 0) {
      await supabaseAdmin.from('mappa_piani').delete().eq('id', pianoId);
      pianoDeleted = true;
    }

    await registraAzione({
      azione: 'piano.operatore.rimuovi',
      attore,
      entita: 'mappa_piani',
      entitaId: pianoId,
      req,
      dettaglio: {
        staff_id: staffId,
        staff_name: rapportiniRimossi[0]?.staff_name ?? null,
        piano_data: (piano as { data: string }).data,
        n_rapportini_eliminati: rapportiniRimossi.length,
        rapportini_eliminati: rapportiniRimossi,
        n_interventi_eliminati: nInterventi ?? 0,
        n_interventi_completati_eliminati: nCompletati ?? 0,
        // true = il piano è rimasto senza operatori ed è stato eliminato a sua volta:
        // da lì parte il CASCADE che si porta via i rapportini di chiunque altro vi resti.
        piano_eliminato: pianoDeleted,
      },
    });

    return NextResponse.json({ ok: true, pianoDeleted });
  } catch (err: any) {
    console.error('[DELETE /api/mappa/piani/operatore]', err.message);
    await registraAzione({
      azione: 'piano.operatore.rimuovi',
      attore,
      entita: 'mappa_piani',
      entitaId: new URL(req.url).searchParams.get('pianoId'),
      esito: 'errore',
      statoHttp: 500,
      req,
      dettaglio: { errore: err.message },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
