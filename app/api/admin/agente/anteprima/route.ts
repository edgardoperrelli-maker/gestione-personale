import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { risolviEsecutore } from '@/lib/agente/risolviEsecutore';
import { caricaRapportiniEsistenti } from '@/lib/agente/caricaRapportiniEsistenti';
import { costruisciAnteprima, type RigaP } from '@/lib/agente/costruisciAnteprima';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { ids?: string[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ gruppi: [] }, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const { data: rowsRaw, error } = await supabaseAdmin
      .from('agente_pianificabili')
      .select('id, file, odl, matricola, indirizzo, comune, data, esecutore')
      .in('id', ids);
    if (error) throw error;
    const righe = (rowsRaw ?? []) as RigaP[];

    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staff = (staffRows ?? []) as { id: string; display_name: string }[];

    // per ogni data distinta: rapportini esistenti dei soli operatori risolti (per il conflitto)
    const datas = [...new Set(righe.map((r) => r.data))];
    const esistentiPerData: Record<string, RapEsistente[]> = {};
    for (const data of datas) {
      const staffIds = [...new Set(
        righe.filter((r) => r.data === data).map((r) => {
          const ris = risolviEsecutore(r.esecutore ?? '', staff);
          return 'errore' in ris ? null : ris.staffId;
        }).filter((x): x is string => !!x),
      )];
      esistentiPerData[data] = await caricaRapportiniEsistenti(supabaseAdmin, data, staffIds);
    }

    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData });
    return NextResponse.json({ gruppi }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore anteprima.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
