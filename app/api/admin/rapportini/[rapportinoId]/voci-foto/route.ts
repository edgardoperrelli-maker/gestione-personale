import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { contaFotoScaricabili } from '@/utils/rapportini/contaFotoScaricabili';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/**
 * GET /api/admin/rapportini/[rapportinoId]/voci-foto
 * Elenco delle voci con foto scaricabili: [{ voceId, via, odl, nFoto }] (solo nFoto>0).
 * Alimenta la modale di download "per indirizzo".
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

  const chiaviFoto = ((rap.campi_snapshot ?? []) as TemplateCampo[])
    .filter((c) => c.tipo === 'foto')
    .map((c) => c.chiave);
  if (chiaviFoto.length === 0) return NextResponse.json([]);

  const { data: vociRows, error } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, via, odl, risposte')
    .eq('rapportino_id', rapportinoId)
    .order('ordine', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = ((vociRows ?? []) as Array<{ id: string; via: string | null; odl: string | null; risposte: Record<string, unknown> | null }>)
    .map((v) => ({ voceId: v.id, via: v.via, odl: v.odl, nFoto: contaFotoScaricabili(v.risposte, chiaviFoto) }))
    .filter((v) => v.nFoto > 0);

  return NextResponse.json(out);
}
