import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { pianificaAssegnazione } from '@/lib/interventi/assegnazione';
import type { StatoIntervento } from '@/lib/interventi/statoInterventi';

export const runtime = 'nodejs';

/**
 * POST /api/interventi/assegna — assegna/riassegna/disassegna uno o più interventi.
 * Body JSON: { ids: string[], staffId: string | null }.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; staffId?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [];
    const staffId = typeof body.staffId === 'string' && body.staffId.trim() !== '' ? body.staffId.trim() : null;

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nessun intervento selezionato.' }, { status: 400 });
    }

    const { data: rows, error } = await supabaseAdmin.from('interventi').select('id, stato').in('id', ids);
    if (error) throw error;

    const statoById = new Map<string, StatoIntervento>();
    for (const r of (rows ?? []) as Array<{ id: string; stato: StatoIntervento }>) {
      statoById.set(r.id, r.stato);
    }

    let assegnati = 0;
    const scartati: Array<{ id: string; errore: string }> = [];

    for (const id of ids) {
      const stato = statoById.get(id);
      if (!stato) {
        scartati.push({ id, errore: 'Intervento non trovato' });
        continue;
      }
      const esito = pianificaAssegnazione(stato, staffId);
      if (!esito.ok) {
        scartati.push({ id, errore: esito.errore });
        continue;
      }
      const { patch } = esito;
      const update: Record<string, unknown> = { staff_id: patch.staff_id, stato: patch.stato };
      if (patch.assegnatoAt === 'set') update.assegnato_at = new Date().toISOString();
      else if (patch.assegnatoAt === 'clear') update.assegnato_at = null;
      if (patch.azzeraAvvio) {
        update.iniziato_at = null;
        update.chiuso_at = null;
      }
      const { error: ue } = await supabaseAdmin.from('interventi').update(update).eq('id', id);
      if (ue) throw new Error(`Update intervento ${id} fallito: ${ue.message}`);
      assegnati += 1;
    }

    return NextResponse.json({ assegnati, scartati });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore assegnazione.' }, { status: 500 });
  }
}
