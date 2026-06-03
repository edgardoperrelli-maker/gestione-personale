import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pianificaChiusuraOperatore, type AzioneOperatore } from '@/lib/interventi/chiusuraOperatore';
import type { EsitoIntervento, StatoIntervento } from '@/lib/interventi/statoInterventi';

export const runtime = 'nodejs';

/** Data odierna in fuso Europe/Rome (YYYY-MM-DD). */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/**
 * POST /api/agenda/[token]/intervento — l'operatore chiude un intervento.
 * Body: { interventoId, azione: 'fatto'|'non_fatto', causale?, motivo? }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const { data: tokRow } = await supabaseAdmin
      .from('agenda_token')
      .select('staff_id, data')
      .eq('token', token)
      .maybeSingle();
    const tok = tokRow as { staff_id: string; data: string } | null;
    if (!tok) return NextResponse.json({ error: 'Agenda non trovata.' }, { status: 404 });

    if (tok.data !== oggiRoma()) {
      return NextResponse.json({ error: 'Agenda non più modificabile (giornata chiusa).' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      interventoId?: unknown;
      azione?: unknown;
      causale?: unknown;
      motivo?: unknown;
    };
    const interventoId = typeof body.interventoId === 'string' ? body.interventoId : '';
    const azione: AzioneOperatore | null =
      body.azione === 'fatto' || body.azione === 'non_fatto' ? body.azione : null;
    const causale = typeof body.causale === 'string' ? (body.causale as EsitoIntervento) : null;
    const motivo = typeof body.motivo === 'string' ? body.motivo : null;
    if (!interventoId || !azione) {
      return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
    }

    const { data: intRow } = await supabaseAdmin
      .from('interventi')
      .select('id, stato, committente, staff_id, data')
      .eq('id', interventoId)
      .maybeSingle();
    const it = intRow as
      | { id: string; stato: StatoIntervento; committente: string | null; staff_id: string | null; data: string }
      | null;
    if (!it || it.staff_id !== tok.staff_id || it.data !== tok.data) {
      return NextResponse.json({ error: 'Intervento non valido per questa agenda.' }, { status: 400 });
    }

    const piano = pianificaChiusuraOperatore({
      statoCorrente: it.stato,
      committente: it.committente,
      azione,
      causale,
      motivo,
    });
    if (!piano.ok) return NextResponse.json({ error: piano.errore }, { status: 400 });

    const { error: ue } = await supabaseAdmin
      .from('interventi')
      .update({
        stato: piano.patch.stato,
        esito: piano.patch.esito,
        esito_motivo: piano.patch.esito_motivo,
        chiuso_at: new Date().toISOString(),
      })
      .eq('id', interventoId);
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    return NextResponse.json({ ok: true, stato: piano.patch.stato, esito: piano.patch.esito });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore.' }, { status: 500 });
  }
}
