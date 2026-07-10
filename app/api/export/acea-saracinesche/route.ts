import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { aggregaSaracinescaPerOdl, type RigaSaracinescaDb } from '@/lib/limitazione/aceaSaracinesche';

export const runtime = 'nodejs';

type InterventoRow = {
  id: string;
  odl: string | null;
};

/**
 * Storico completo (nessun filtro su committente/intervento_tipo, nessuna finestra data): serve a
 * coprire anche gli ODL ACEA con saracinesca sostituita su tipi diversi da "limitazione/massiva"
 * (es. Sospensione fornitura, Rimozione misuratore per morosità), che l'export lim-massive esclude.
 */
export async function GET(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  try {
    // 1) interventi completati con odl valorizzato
    const PAGE = 1000;
    const interventi: InterventoRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl')
        .eq('stato', 'completato')
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as InterventoRow[];
      interventi.push(...rows);
      if (rows.length < PAGE) break;
    }

    // 2) valori saracinesca da rapportino_voci (stesse due chiavi di lim-massive)
    const odlById = new Map(interventi.map((i) => [i.id, i.odl]));
    const IN_CHUNK = 200;
    const ids = interventi.map((i) => i.id);
    const righeDb: RigaSaracinescaDb[] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      const { data: voci, error } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', chunk);
      if (error) throw error;
      for (const v of (voci ?? []) as Array<{
        intervento_id: string | null;
        risposte: Record<string, unknown> | null;
      }>) {
        if (!v.intervento_id) continue;
        righeDb.push({
          odl: odlById.get(v.intervento_id) ?? null,
          sostituzione_valvola: v.risposte?.['sostituzione_valvola'],
          sost_valvola: v.risposte?.['sost_valvola'],
        });
      }
    }

    // 3) aggrega (funzione pura testata)
    const righe = aggregaSaracinescaPerOdl(righeDb);

    return NextResponse.json(
      { count: righe.length, righe },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
