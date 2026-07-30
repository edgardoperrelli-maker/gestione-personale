import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

type AzioneLog = {
  odl: string;
  numero_operazione: string;
  azione: 'creato' | 'aggiornato';
  intervento_id: string | null;
  prima: { data: string; staff_id: string | null } | null;
};

/**
 * POST /api/acea/pianifica/annulla — annulla un'operazione di pianificazione in blocco.
 *
 * Gli interventi CREATI vengono eliminati; quelli SPOSTATI tornano alla data e all'operatore che
 * avevano prima. Un intervento nel frattempo completato non si tocca: annullare un'assegnazione
 * non può cancellare del lavoro svolto, e chi annulla deve saperlo.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { operazioneId } = (await req.json()) as { operazioneId?: string };
    if (!operazioneId) {
      return NextResponse.json({ error: 'Operazione mancante.' }, { status: 400 });
    }

    const { data: op, error: eOp } = await supabaseAdmin
      .from('acea_operazioni')
      .select('id, tipo, dettaglio, annullata_il')
      .eq('id', operazioneId)
      .maybeSingle();
    if (eOp) throw eOp;
    if (!op) return NextResponse.json({ error: 'Operazione non trovata.' }, { status: 404 });
    if (op.annullata_il) {
      return NextResponse.json({ error: 'Operazione già annullata.' }, { status: 409 });
    }

    const azioni = ((op.dettaglio as { azioni?: AzioneLog[] })?.azioni ?? []) as AzioneLog[];
    const idInterventi = azioni.map((a) => a.intervento_id).filter(Boolean) as string[];

    // Stato attuale: un intervento completato dopo l'assegnazione non va toccato.
    const statoAttuale = new Map<string, string>();
    for (let i = 0; i < idInterventi.length; i += 200) {
      const blocco = idInterventi.slice(i, i + 200);
      const { data: righe, error } = await supabaseAdmin
        .from('interventi')
        .select('id, stato')
        .in('id', blocco);
      if (error) throw error;
      for (const r of (righe ?? []) as Array<{ id: string; stato: string }>) {
        statoAttuale.set(r.id, r.stato);
      }
    }

    let eliminati = 0;
    let ripristinati = 0;
    const protetti: string[] = [];

    for (const a of azioni) {
      if (!a.intervento_id) continue;
      const stato = statoAttuale.get(a.intervento_id);
      if (stato === undefined) continue;           // già sparito: niente da fare
      if (stato === 'completato') {
        protetti.push(a.odl);
        continue;
      }
      if (a.azione === 'creato') {
        const { error } = await supabaseAdmin.from('interventi').delete().eq('id', a.intervento_id);
        if (error) throw error;
        eliminati++;
      } else if (a.prima) {
        const { error } = await supabaseAdmin
          .from('interventi')
          .update({ data: a.prima.data, staff_id: a.prima.staff_id })
          .eq('id', a.intervento_id);
        if (error) throw error;
        ripristinati++;
      }
    }

    const { error: eUpd } = await supabaseAdmin
      .from('acea_operazioni')
      .update({ annullata_il: new Date().toISOString(), annullata_da: auth.user.id })
      .eq('id', operazioneId);
    if (eUpd) throw eUpd;

    return NextResponse.json(
      { eliminati, ripristinati, protetti },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore annullamento.' },
      { status: 500 },
    );
  }
}
