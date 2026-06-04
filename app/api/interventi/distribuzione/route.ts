import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { pianificaAssegnazione } from '@/lib/interventi/assegnazione';
import type { StatoIntervento } from '@/lib/interventi/statoInterventi';
import { generaAgendaToken } from '@/lib/interventi/agendaToken';

export const runtime = 'nodejs';

type Assegnazione = { intervento_id: string; staff_id: string; ordine: number };

function isAssegnazione(a: unknown): a is Assegnazione {
  if (!a || typeof a !== 'object') return false;
  const r = a as Record<string, unknown>;
  return (
    typeof r.intervento_id === 'string' && r.intervento_id.trim() !== '' &&
    typeof r.staff_id === 'string' && r.staff_id.trim() !== '' &&
    typeof r.ordine === 'number' && Number.isInteger(r.ordine) && r.ordine > 0
  );
}

/**
 * POST /api/interventi/distribuzione — applica la distribuzione mappa→interventi.
 * Body: { data: string; assegnazioni: { intervento_id, staff_id, ordine }[] }.
 * Riusa pianificaAssegnazione() e generaAgendaToken() (stati/transizioni/token
 * identici alla pipeline). Scrive staff_id, ordine, stato='assegnato', assegnato_at.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { data?: unknown; assegnazioni?: unknown };
    const data =
      typeof body.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : null;
    if (!data) {
      return NextResponse.json(
        { error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' },
        { status: 400 },
      );
    }
    const assegnazioni: Assegnazione[] = Array.isArray(body.assegnazioni)
      ? body.assegnazioni.filter(isAssegnazione)
      : [];
    if (assegnazioni.length === 0) {
      return NextResponse.json({ error: 'Nessuna assegnazione valida.' }, { status: 400 });
    }

    const ids = assegnazioni.map((a) => a.intervento_id);
    const { data: rows, error } = await supabaseAdmin.from('interventi').select('id, stato').in('id', ids);
    if (error) throw error;
    const byId = new Map<string, StatoIntervento>();
    for (const r of (rows ?? []) as Array<{ id: string; stato: StatoIntervento }>) byId.set(r.id, r.stato);

    let assegnati = 0;
    const scartati: Array<{ id: string; errore: string }> = [];
    const staffCoinvolti = new Set<string>();

    for (const a of assegnazioni) {
      const stato = byId.get(a.intervento_id);
      if (!stato) {
        scartati.push({ id: a.intervento_id, errore: 'Intervento non trovato' });
        continue;
      }
      const esito = pianificaAssegnazione(stato, a.staff_id);
      if (!esito.ok) {
        scartati.push({ id: a.intervento_id, errore: esito.errore });
        continue;
      }
      const { patch } = esito;
      const update: Record<string, unknown> = {
        staff_id: patch.staff_id,
        stato: patch.stato,
        ordine: a.ordine,
      };
      if (patch.assegnatoAt === 'set') update.assegnato_at = new Date().toISOString();
      else if (patch.assegnatoAt === 'clear') update.assegnato_at = null;
      if (patch.azzeraAvvio) {
        update.iniziato_at = null;
        update.chiuso_at = null;
      }
      const { error: ue } = await supabaseAdmin.from('interventi').update(update).eq('id', a.intervento_id);
      if (ue) throw new Error(`Update intervento ${a.intervento_id} fallito: ${ue.message}`);
      assegnati += 1;
      if (patch.staff_id) staffCoinvolti.add(patch.staff_id);
    }

    // Garantisce un token agenda per ogni (staff, giorno) coinvolto. Idempotente.
    if (staffCoinvolti.size > 0) {
      const tokenRows = Array.from(staffCoinvolti).map((staff_id) => ({
        staff_id,
        data,
        token: generaAgendaToken(),
      }));
      const { error: te } = await supabaseAdmin
        .from('agenda_token')
        .upsert(tokenRows, { onConflict: 'staff_id,data', ignoreDuplicates: true });
      if (te) throw new Error(`Generazione token agenda fallita: ${te.message}`);
    }

    return NextResponse.json({ assegnati, scartati });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore distribuzione.' },
      { status: 500 },
    );
  }
}
