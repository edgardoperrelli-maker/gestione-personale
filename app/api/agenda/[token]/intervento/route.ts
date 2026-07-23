import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pianificaChiusuraOperatore, type AzioneOperatore } from '@/lib/interventi/chiusuraOperatore';
import { chiavePositivo, decidiChiusuraConPositivi, indicizzaPositivi } from '@/lib/interventi/odlPositivi';
import { sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
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
      .select('id, stato, committente, staff_id, data, odl')
      .eq('id', interventoId)
      .maybeSingle();
    const it = intRow as
      | { id: string; stato: StatoIntervento; committente: string | null; staff_id: string | null; data: string; odl: string | null }
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

    // ODL con positivo GIÀ presente altrove (qualsiasi data): un ODL positivo è
    // definitivamente chiuso. Un secondo "Fatto" non è un esito reale → l'intervento viene
    // annullato come DOPPIO POSITIVO e marcato per la riconciliazione ufficio; un "Non fatto"
    // chiude normalmente ma viene comunque marcato (visita non dovuta). Non blocca l'operatore.
    let originale: { id: string; data: string | null } | undefined;
    if (it.odl && (it.odl ?? '').trim()) {
      const { data: posRows } = await supabaseAdmin
        .from('interventi')
        .select('id, odl, data, committente')
        .eq('esito', 'eseguito_positivo')
        .eq('odl', it.odl)
        .neq('id', interventoId);
      originale = indicizzaPositivi(
        (posRows ?? []) as Array<{ id: string; odl: string | null; data: string | null; committente: string | null }>,
      ).get(chiavePositivo(it.committente, it.odl));
    }
    const decisione = decidiChiusuraConPositivi({
      interventoId,
      esitoPositivo: piano.patch.esito === 'eseguito_positivo',
      originale,
    });

    const patch =
      decisione.tipo === 'annulla_doppio_positivo'
        ? {
            stato: 'annullato' as const, esito: null, esito_motivo: decisione.motivo,
            da_riconciliare: true, riconciliazione_rif_id: decisione.rifId,
          }
        : {
            stato: piano.patch.stato,
            esito: piano.patch.esito,
            esito_motivo: piano.patch.esito_motivo,
            ...(decisione.tipo === 'chiudi_e_riconcilia'
              ? { da_riconciliare: true, riconciliazione_rif_id: decisione.rifId }
              : {}),
          };
    const { error: ue } = await supabaseAdmin
      .from('interventi')
      .update({ ...patch, chiuso_at: new Date().toISOString() })
      .eq('id', interventoId);
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    // Positivo appena registrato → sweep: revoca voci/interventi aperti con lo stesso ODL
    // negli altri rapportini (anche di piani futuri). Best-effort.
    if (patch.esito === 'eseguito_positivo') {
      try {
        await sweepDopoPositivi(supabaseAdmin, [interventoId]);
      } catch (e) {
        console.error('[agenda/intervento] sweep positivo fallito:', e instanceof Error ? e.message : String(e));
      }
    }

    return NextResponse.json({ ok: true, stato: patch.stato, esito: patch.esito });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore.' }, { status: 500 });
  }
}
