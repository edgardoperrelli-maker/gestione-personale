import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { riapribile } from '@/lib/interventi/manuali/riaperturaRifiuto';

export const runtime = 'nodejs';

/**
 * POST: annulla un rifiuto sbagliato → la richiesta torna `in_attesa` nella coda.
 *
 * Speculare esatto di `rifiuta`: rimette in piedi lo stato di prima della decisione (motivo,
 * decisore e timestamp azzerati) e riporta la voce del rapportino a `in_attesa`, così
 * l'operatore la rivede «⏳ Sospeso» invece che «✗ Rifiutato» e l'ufficio può approvarla col
 * flusso normale. Nessuna scorciatoia: NON approva, rimette solo la pratica in coda.
 *
 * Non tocca lo storage né le foto: il rifiuto non le cancella (lo fa solo la sostituzione del
 * rifiutato in `/api/r/[token]/intervento-manuale`, che però elimina anche la richiesta — e una
 * richiesta eliminata qui non arriva proprio, risponde 404).
 *
 * Gemello di `/api/admin/pi/interventi/[id]/riapri`, che copre la corsia Pronto Intervento e
 * riapre anche gli approvati (là l'intervento canonico si può cancellare: qui no, vedi
 * `riaperturaRifiuto`).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, fonte')
    .eq('id', id)
    // Le richieste di Pronto Intervento hanno la loro riapertura, con regole sue.
    .neq('fonte', 'pronto_intervento')
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!riapribile(richiesta.stato)) {
    return NextResponse.json({ error: 'stato_non_riapribile', stato: richiesta.stato }, { status: 409 });
  }

  // ── CHECK-AND-SET ATOMICO ────────────────────────────────────────────────────
  // Riporta a 'in_attesa' SOLO se la riga è ancora 'rifiutato': fra la lettura qui sopra e
  // questa update un altro admin può aver già riaperto (e magari approvato) la richiesta, e
  // riportarla in coda a quel punto la sfilerebbe da sotto un intervento appena creato.
  // `intervento_id: null` esplicito: il CHECK `interventi_manuali_intervento_solo_deciso`
  // ammette un intervento agganciato solo su 'approvato'/'auto_liberi'.
  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ stato: 'in_attesa', motivo_rifiuto: null, deciso_da: null, deciso_at: null, intervento_id: null })
    .eq('id', id)
    .eq('stato', 'rifiutato')
    .select('id')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });

  // ── Riporta la voce in sospeso ───────────────────────────────────────────────
  // Può mancare (`voce_id` è ON DELETE SET NULL): la richiesta resta comunque riaperta, come
  // già fa `rifiuta` all'incontrario. Il gate `approvazione_stato` che rimettiamo qui è quello
  // che ri-nasconde la voce ai duplicati — ricerca matricola e anti-doppione del "+" saltano
  // le rifiutate, e senza questo ripristino la stessa matricola potrebbe rientrare due volte.
  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ approvazione_stato: 'in_attesa' })
      .eq('id', richiesta.voce_id);
  }

  return NextResponse.json({ ok: true });
}
