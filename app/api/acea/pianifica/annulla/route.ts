import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { sincronizzaOperatorePiano } from '@/lib/acea/pianoCommessa';

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

    // Stato attuale: un intervento completato dopo l'assegnazione non va toccato. `piano_id` e
    // `staff_id` servono a rinfrescare i task JSONB dei piani toccati dopo il ripristino.
    const statoAttuale = new Map<string, { stato: string; piano_id: string | null; staff_id: string | null }>();
    for (let i = 0; i < idInterventi.length; i += 200) {
      const blocco = idInterventi.slice(i, i + 200);
      const { data: righe, error } = await supabaseAdmin
        .from('interventi')
        .select('id, stato, piano_id, staff_id')
        .in('id', blocco);
      if (error) throw error;
      for (const r of (righe ?? []) as Array<{ id: string; stato: string; piano_id: string | null; staff_id: string | null }>) {
        statoAttuale.set(r.id, { stato: r.stato, piano_id: r.piano_id ?? null, staff_id: r.staff_id ?? null });
      }
    }

    let eliminati = 0;
    let ripristinati = 0;
    const protetti: string[] = [];
    // Coppie (piano, operatore) che perdono un intervento: i loro task `acea:*` vanno rinfrescati.
    const coppieDaRinfrescare = new Set<string>();

    for (const a of azioni) {
      if (!a.intervento_id) continue;
      const attuale = statoAttuale.get(a.intervento_id);
      if (attuale === undefined) continue;         // già sparito: niente da fare
      if (attuale.stato === 'completato') {
        protetti.push(a.odl);
        continue;
      }
      if (attuale.piano_id && attuale.staff_id) {
        coppieDaRinfrescare.add(`${attuale.piano_id}|${attuale.staff_id}`);
      }
      if (a.azione === 'creato') {
        const { error } = await supabaseAdmin.from('interventi').delete().eq('id', a.intervento_id);
        if (error) throw error;
        eliminati++;
      } else if (a.prima) {
        const { error } = await supabaseAdmin
          .from('interventi')
          .update({
            data: a.prima.data, staff_id: a.prima.staff_id,
            // Il piano del giorno di PRIMA non è nel log dell'operazione: si sgancia
            // (piano_id null) e la prossima pianificazione/generazione lo ri-adotta sul
            // piano giusto. Meglio sganciato che appeso al piano del giorno sbagliato.
            piano_id: null,
          })
          .eq('id', a.intervento_id);
        if (error) throw error;
        ripristinati++;
      }
    }

    // I task JSONB delle coppie toccate: senza questo rinfresco il piano mostrerebbe ancora
    // le attività appena annullate/spostate. Best-effort: la prossima generazione rapportini
    // (passo di adozione) ripete comunque la stessa scrittura.
    for (const coppia of coppieDaRinfrescare) {
      const [pid, sid] = coppia.split('|');
      if (!pid || !sid) continue;
      const sync = await sincronizzaOperatorePiano(supabaseAdmin, pid, sid);
      if (!sync.ok) console.error('[acea/pianifica/annulla] riga operatore non sincronizzata:', pid, sid, sync.error);
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
