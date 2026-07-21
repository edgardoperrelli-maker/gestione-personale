import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { contaFotoScaricabili } from '@/utils/rapportini/contaFotoScaricabili';
import { raggruppaPerVia, type RichiestaItalgas, type ViaVoce } from '@/lib/interventi/manuali/gruppiFotoItalgas';
import { unioneCampi } from '@/utils/rapportini/campiDiVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

const COMMITTENTE_ITALGAS_MOBILE = 'italgas';

const testo = (x: unknown): string | null => {
  const t = String(x ?? '').trim();
  return t === '' ? null : t;
};

/**
 * GET /api/admin/rapportini/[rapportinoId]/voci-foto
 * Elenco degli indirizzi con foto scaricabili, per alimentare la modale "Per indirizzo":
 * - voci CLASSICHE con foto nei campi (`risposte`): [{ voceId, via, odl, nFoto }].
 * - richieste manuali "Italgas mobile" (committente=italgas, foto vecchio/nuovo/minibag):
 *   raggruppate per VIA (non per voceId — il collegamento al task-via padre è spesso
 *   assente o orfano, vedi gruppiFotoItalgas.ts): [{ via, nFoto }], scaricabili con
 *   foto-zip?via=<via>.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;

  const { data: rap, error: rapErr } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (rapErr) return NextResponse.json({ error: rapErr.message }, { status: 500 });
  if (!rap) return NextResponse.json({ error: 'rapportino non trovato' }, { status: 404 });

  const { data: vociRows, error } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, via, odl, risposte, campi_snapshot')
    .eq('rapportino_id', rapportinoId)
    .order('ordine', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tipizzate = (vociRows ?? []) as Array<{
    id: string;
    via: string | null;
    odl: string | null;
    risposte: Record<string, unknown> | null;
    campi_snapshot?: unknown;
  }>;

  // Voci classiche con foto in `risposte`.
  const chiaviFoto = unioneCampi(
    (rap.campi_snapshot ?? []) as TemplateCampo[],
    tipizzate.map((v) => (Array.isArray(v.campi_snapshot) ? (v.campi_snapshot as TemplateCampo[]) : null)),
  )
    .filter((c) => c.tipo === 'foto')
    .map((c) => c.chiave);
  const vociClassiche = chiaviFoto.length === 0 ? [] : tipizzate
    .map((v) => ({ voceId: v.id, via: v.via, odl: v.odl, nFoto: contaFotoScaricabili(v.risposte, chiaviFoto) }))
    .filter((v) => v.nFoto > 0);

  // Gruppi "Italgas mobile" per via (indipendenti dal collegamento al task-via padre).
  const { data: richieste } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, parent_voce_id, dati_correnti')
    .eq('rapportino_id', rapportinoId)
    .eq('committente', COMMITTENTE_ITALGAS_MOBILE)
    .order('created_at', { ascending: true });
  const richiesteRows = (richieste ?? []) as Array<{
    id: string;
    parent_voce_id: string | null;
    dati_correnti: { anagrafica?: Record<string, unknown> } | null;
  }>;

  let gruppiItalgas: Array<{ via: string | null; odl: null; nFoto: number }> = [];
  if (richiesteRows.length > 0) {
    const vociById = new Map<string, ViaVoce>(tipizzate.map((v) => [v.id, { id: v.id, via: v.via }]));
    const richiesteItalgas: RichiestaItalgas[] = richiesteRows.map((r) => ({
      id: r.id,
      parentVoceId: r.parent_voce_id,
      viaAnagrafica: testo(r.dati_correnti?.anagrafica?.via),
      matricola: testo(r.dati_correnti?.anagrafica?.matricola),
    }));
    const gruppi = raggruppaPerVia(richiesteItalgas, vociById);

    const { data: fotoRows } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .select('richiesta_id')
      .in('richiesta_id', richiesteRows.map((r) => r.id));
    const fotoPerRichiesta = new Map<string, number>();
    for (const f of (fotoRows ?? []) as Array<{ richiesta_id: string }>) {
      fotoPerRichiesta.set(f.richiesta_id, (fotoPerRichiesta.get(f.richiesta_id) ?? 0) + 1);
    }

    gruppiItalgas = gruppi
      .map((g) => ({
        via: g.via,
        odl: null,
        nFoto: g.richiestaIds.reduce((n, id) => n + (fotoPerRichiesta.get(id) ?? 0), 0),
      }))
      .filter((g) => g.nFoto > 0);
  }

  return NextResponse.json([...vociClassiche, ...gruppiItalgas]);
}
