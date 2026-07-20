import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/**
 * POST /api/interventi/risincronizza?data=YYYY-MM-DD  (admin)
 * Ri-aggancia le voci scollegate agli interventi del giorno (ODL/matricola/PDR) e
 * riapplica l'esito corrente di ogni voce compilata sull'intervento collegato,
 * SENZA inviare i rapportini. Idempotente. Recupera i rapportini già compilati
 * prima che l'auto-aggancio fosse attivo.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const { data: interventi } = await supabaseAdmin
      .from('interventi')
      .select('id, staff_id, odl, matricola_contatore, pdr')
      .eq('data', data)
      .neq('stato', 'annullato');
    const resolve = buildVoceInterventoLinker((interventi ?? []) as InterventoLinkRow[]);

    const { data: raps } = await supabaseAdmin
      .from('rapportini')
      .select('id, staff_id, campi_snapshot')
      .eq('data', data);

    let agganciate = 0;
    let completati = 0;

    // Catch-up completo: per OGNI voce assicura il collegamento (aggancia quelle scollegate)
    // e riapplica l'esito sull'intervento. `updated_at` della voce = ORA REALE DI COMPILAZIONE.
    for (const rap of (raps ?? []) as Array<{ id: string; staff_id: string | null; campi_snapshot: unknown }>) {
      const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
      const { data: voci } = await supabaseAdmin
        .from('rapportino_voci')
        .select('id, intervento_id, raw_json, risposte, updated_at, campi_snapshot')
        .eq('rapportino_id', rap.id);

      for (const v of (voci ?? []) as Array<{
        id: string;
        intervento_id: string | null;
        raw_json: unknown;
        risposte: Record<string, unknown> | null;
        updated_at: string;
        campi_snapshot?: unknown;
      }>) {
        let interventoId = v.intervento_id;
        if (!interventoId) {
          const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
          const found = resolve({
            staff_id: rap.staff_id,
            odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined),
            matricola: raw.matricola as string | null | undefined,
            pdr: raw.pdr as string | null | undefined,
          });
          if (found) {
            interventoId = found;
            await supabaseAdmin.from('rapportino_voci').update({ intervento_id: found }).eq('id', v.id);
            agganciate += 1;
          }
        }
        if (!interventoId) continue;
        // Voce neutra → non tocca (non riapre nel recupero). Esito valutato sui campi
        // DELLA voce (flusso del suo gruppo attività, fallback rapportino).
        const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
          ? (v.campi_snapshot as TemplateCampo[])
          : campi;
        const patch = esitoInterventoDaVoce(v.risposte ?? {}, campiV);
        if (!patch) continue;
        const { error: e } = await supabaseAdmin
          .from('interventi')
          .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: v.updated_at })
          .eq('id', interventoId)
          .neq('stato', 'annullato');
        if (!e) completati += 1;
      }
    }

    return NextResponse.json({ ok: true, agganciate, completati });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore risincronizzazione.' }, { status: 500 });
  }
}
