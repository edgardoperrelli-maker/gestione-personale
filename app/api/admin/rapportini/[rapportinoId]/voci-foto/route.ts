import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { contaFotoScaricabili } from '@/utils/rapportini/contaFotoScaricabili';
import { isTaskVia, voceTaskVia } from '@/lib/interventi/manuali/taskVia';
import { unioneCampi } from '@/utils/rapportini/campiDiVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/**
 * GET /api/admin/rapportini/[rapportinoId]/voci-foto
 * Elenco delle voci con foto scaricabili: [{ voceId, via, odl, nFoto }] (solo nFoto>0).
 * Alimenta la modale di download "per indirizzo".
 * Nei giri task-via (BONIFICHE EXTRA) le foto vivono negli interventi "+" figli
 * (interventi_manuali_foto): per le voci contenitore si contano quelle, così ogni
 * VIA compare in lista e si può scaricare il suo ZIP (foto-zip?voceId=...).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;

  const { data: rap, error: rapErr } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot, template_id')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (rapErr) return NextResponse.json({ error: rapErr.message }, { status: 500 });
  if (!rap) return NextResponse.json({ error: 'rapportino non trovato' }, { status: 404 });

  // Flag task-via del template (giro "solo vie"): letto live, assente → false.
  let tplTaskVia = false;
  const templateId = (rap as { template_id?: string | null }).template_id;
  if (templateId) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('task_via')
      .eq('id', templateId)
      .maybeSingle();
    tplTaskVia = Boolean((tpl as { task_via?: boolean } | null)?.task_via);
  }

  const { data: vociRows, error } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, via, odl, attivita, manuale, risposte, campi_snapshot')
    .eq('rapportino_id', rapportinoId)
    .order('ordine', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tipizzate = (vociRows ?? []) as Array<{
    id: string;
    via: string | null;
    odl: string | null;
    attivita: string | null;
    manuale: boolean | null;
    risposte: Record<string, unknown> | null;
    campi_snapshot?: unknown;
  }>;
  // Chiavi foto = unione rapportino + per-voce (flussi diversi nello stesso rapportino).
  const chiaviFoto = unioneCampi(
    (rap.campi_snapshot ?? []) as TemplateCampo[],
    tipizzate.map((v) => (Array.isArray(v.campi_snapshot) ? (v.campi_snapshot as TemplateCampo[]) : null)),
  )
    .filter((c) => c.tipo === 'foto')
    .map((c) => c.chiave);

  const giroTaskVia = tplTaskVia || tipizzate.some((v) => isTaskVia(v));
  if (chiaviFoto.length === 0 && !giroTaskVia) return NextResponse.json([]);

  // Foto dei "+" figli per voce contenitore: interventi_manuali.parent_voce_id → conteggio
  // delle righe in interventi_manuali_foto.
  const fotoFigliPerVoce = new Map<string, number>();
  if (giroTaskVia) {
    const { data: richieste } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, parent_voce_id')
      .eq('rapportino_id', rapportinoId);
    const conParent = ((richieste ?? []) as Array<{ id: string; parent_voce_id: string | null }>)
      .filter((r): r is { id: string; parent_voce_id: string } => !!r.parent_voce_id);
    if (conParent.length > 0) {
      const { data: fotoRows } = await supabaseAdmin
        .from('interventi_manuali_foto')
        .select('richiesta_id')
        .in('richiesta_id', conParent.map((r) => r.id));
      const perRichiesta = new Map<string, number>();
      for (const f of (fotoRows ?? []) as Array<{ richiesta_id: string }>) {
        perRichiesta.set(f.richiesta_id, (perRichiesta.get(f.richiesta_id) ?? 0) + 1);
      }
      for (const r of conParent) {
        const n = perRichiesta.get(r.id) ?? 0;
        if (n > 0) fotoFigliPerVoce.set(r.parent_voce_id, (fotoFigliPerVoce.get(r.parent_voce_id) ?? 0) + n);
      }
    }
  }

  const out = tipizzate
    .map((v) => {
      const contenitore = v.manuale !== true && voceTaskVia(v, { tutto: tplTaskVia });
      return {
        voceId: v.id,
        via: v.via,
        odl: v.odl,
        nFoto: contaFotoScaricabili(v.risposte, chiaviFoto) + (contenitore ? fotoFigliPerVoce.get(v.id) ?? 0 : 0),
      };
    })
    .filter((v) => v.nFoto > 0);

  return NextResponse.json(out);
}
