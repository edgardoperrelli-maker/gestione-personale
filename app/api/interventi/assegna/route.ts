import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { pianificaAssegnazione } from '@/lib/interventi/assegnazione';
import type { StatoIntervento } from '@/lib/interventi/statoInterventi';
import { generaAgendaToken } from '@/lib/interventi/agendaToken';
import { allineaVociSpostateMulti, type Spostamento } from '@/lib/interventi/allineaVociSpostate';

export const runtime = 'nodejs';

/**
 * POST /api/interventi/assegna — assegna/riassegna/disassegna uno o più interventi.
 * Body JSON: { ids: string[], staffId: string | null }.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; staffId?: unknown; templateId?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [];
    const staffId = typeof body.staffId === 'string' && body.staffId.trim() !== '' ? body.staffId.trim() : null;
    const templateId = typeof body.templateId === 'string' && body.templateId.trim() !== '' ? body.templateId.trim() : null;

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nessun intervento selezionato.' }, { status: 400 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('interventi').select('id, stato, data, staff_id').in('id', ids);
    if (error) throw error;

    const byId = new Map<string, { stato: StatoIntervento; data: string | null; staff_id: string | null }>();
    for (const r of (rows ?? []) as Array<{ id: string; stato: StatoIntervento; data: string | null; staff_id: string | null }>) {
      byId.set(r.id, { stato: r.stato, data: r.data, staff_id: r.staff_id });
    }

    let assegnati = 0;
    const scartati: Array<{ id: string; errore: string }> = [];
    const dateAssegnate = new Set<string>();
    /*
      Gli interventi che cambiano DAVVERO mano: le loro voci di rapportino sono rimaste sul giro
      di prima e vanno tolte da lì.

      È la causa delle 28 voci disallineate misurate il 17/08/2026, e la strada è proprio questa:
      `buildVoceInterventoLinker` aggancia una voce solo a un intervento dello STESSO operatore
      (`voceInterventoLink.ts`), quindi una voce nasce sempre allineata — a disallinearla è una
      RIASSEGNAZIONE successiva, che finora spostava l'intervento e lasciava la voce dov'era.
      Da lì lo storico, che legge l'esecutore dal rapportino padre, accredita il lavoro a chi non
      l'ha fatto. Regola e prudenze in `lib/interventi/vociSpostamento.ts`.
    */
    const spostati: Spostamento[] = [];

    for (const id of ids) {
      const info = byId.get(id);
      if (!info) {
        scartati.push({ id, errore: 'Intervento non trovato' });
        continue;
      }
      const esito = pianificaAssegnazione(info.stato, staffId);
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
      // In assegnazione: associa il template scelto e raccogli (staff, giorno) per il token agenda.
      if (patch.staff_id) {
        if (templateId) update.template_id = templateId;
        if (info.data) dateAssegnate.add(info.data);
      }
      const { error: ue } = await supabaseAdmin.from('interventi').update(update).eq('id', id);
      if (ue) throw new Error(`Update intervento ${id} fallito: ${ue.message}`);
      assegnati += 1;
      // Solo la RIASSEGNAZIONE a un altro operatore lascia voci indietro. La disassegnazione
      // (`staffId` null) non ha una destinazione a cui allinearle: l'intervento torna in coda e
      // la prossima pianificazione lo ricolloca, quindi qui non si tocca niente.
      if (staffId && info.staff_id && info.staff_id !== staffId && info.data) {
        spostati.push({ interventoId: id, staffId, data: info.data });
      }
    }

    // Le voci rimaste sul rapportino del vecchio esecutore: si tolgono se ancora vuote, si
    // segnalano se compilate o già consegnate — non si riscrive il lavoro di nessuno.
    const allineamento = await allineaVociSpostateMulti(supabaseAdmin, spostati);

    // Garantisce un token agenda per ogni (staff, giorno) coinvolto nell'assegnazione.
    if (staffId && dateAssegnate.size > 0) {
      const tokenRows = Array.from(dateAssegnate).map((data) => ({
        staff_id: staffId,
        data,
        token: generaAgendaToken(),
      }));
      const { error: te } = await supabaseAdmin
        .from('agenda_token')
        .upsert(tokenRows, { onConflict: 'staff_id,data', ignoreDuplicates: true });
      if (te) throw new Error(`Generazione token agenda fallita: ${te.message}`);
    }

    return NextResponse.json({
      assegnati, scartati,
      ...(allineamento.avviso ? { avviso: allineamento.avviso } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore assegnazione.' }, { status: 500 });
  }
}
