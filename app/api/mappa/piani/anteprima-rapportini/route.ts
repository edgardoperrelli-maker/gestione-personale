import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { calcolaDiffRapportini, type OperatoreProposto, type VoceEsistente } from '@/utils/rapportini/diffRapportini';

export const runtime = 'nodejs';

type OpBody = { staff_id: string; staff_name?: string | null; tasks?: Array<{ id: string; odl?: string | null; indirizzo?: string | null }> };

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { pianoId, operatori } = (await req.json()) as { pianoId?: string; operatori?: OpBody[] };
    if (!pianoId || !Array.isArray(operatori)) {
      return NextResponse.json({ error: 'pianoId e operatori obbligatori' }, { status: 400 });
    }

    // Rapportini esistenti del piano (staff, stato).
    const { data: raps } = await supabaseAdmin
      .from('rapportini').select('id, staff_id, staff_name, stato').eq('piano_id', pianoId);
    const rapRows = (raps ?? []) as Array<{ id: string; staff_id: string; staff_name: string | null; stato: string }>;
    const staffByRapId = new Map(rapRows.map((r) => [r.id, r]));
    const staffConRapportino = new Set(rapRows.map((r) => String(r.staff_id)));
    const staffInviati = new Set(rapRows.filter((r) => r.stato === 'inviato').map((r) => String(r.staff_id)));

    // Voci esistenti (stato "prima") con descr e intervento_id.
    const rapIds = rapRows.map((r) => r.id);
    const vociEsistenti: VoceEsistente[] = [];
    const interventoIds: string[] = [];
    const taskIdByInterventoId = new Map<string, string>();
    if (rapIds.length > 0) {
      const { data: voci } = await supabaseAdmin
        .from('rapportino_voci').select('rapportino_id, task_id, intervento_id, odl, via').in('rapportino_id', rapIds);
      for (const v of (voci ?? []) as Array<{ rapportino_id: string; task_id: string; intervento_id: string | null; odl: string | null; via: string | null }>) {
        const rap = staffByRapId.get(v.rapportino_id);
        if (!rap) continue;
        vociEsistenti.push({
          taskId: String(v.task_id),
          staffId: String(rap.staff_id),
          staffName: rap.staff_name ?? String(rap.staff_id),
          descr: v.odl ?? v.via ?? String(v.task_id),
        });
        if (v.intervento_id) { interventoIds.push(v.intervento_id); taskIdByInterventoId.set(v.intervento_id, String(v.task_id)); }
      }
    }

    // task completati: intervento collegato con stato 'completato'.
    const taskCompletati = new Set<string>();
    if (interventoIds.length > 0) {
      const { data: ints } = await supabaseAdmin
        .from('interventi').select('id, stato').in('id', interventoIds);
      for (const it of (ints ?? []) as Array<{ id: string; stato: string }>) {
        if (it.stato === 'completato') {
          const tId = taskIdByInterventoId.get(it.id);
          if (tId) taskCompletati.add(tId);
        }
      }
    }

    const operatoriProposti: OperatoreProposto[] = operatori.map((op) => ({
      staffId: String(op.staff_id),
      staffName: op.staff_name ?? String(op.staff_id),
      tasks: (op.tasks ?? []).map((t) => ({ taskId: String(t.id), descr: t.odl ?? t.indirizzo ?? String(t.id) })),
    }));

    const diff = calcolaDiffRapportini({ operatoriProposti, vociEsistenti, staffConRapportino, staffInviati, taskCompletati });
    return NextResponse.json(diff);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore anteprima rapportini.' }, { status: 500 });
  }
}
