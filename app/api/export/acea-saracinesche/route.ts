import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { aggregaSaracinescaPerOdl, type RigaSaracinescaDb } from '@/lib/limitazione/aceaSaracinesche';

export const runtime = 'nodejs';

type VoceRow = {
  intervento_id: string | null;
  risposte: Record<string, unknown> | null;
};

type InterventoRow = {
  id: string;
  odl: string | null;
};

/** Pagina tutte le righe di rapportino_voci la cui `risposte->>chiave` è valorizzata. */
async function leggiVociConChiave(chiave: 'sostituzione_valvola' | 'sost_valvola'): Promise<VoceRow[]> {
  const PAGE = 1000;
  const out: VoceRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('rapportino_voci')
      .select('intervento_id, risposte')
      .not(`risposte->>${chiave}`, 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as VoceRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Storico completo (nessun filtro su committente/intervento_tipo, nessuna finestra data): serve a
 * coprire anche gli ODL ACEA con saracinesca sostituita su tipi diversi da "limitazione/massiva"
 * (es. Sospensione fornitura, Rimozione misuratore per morosità), che l'export lim-massive esclude.
 *
 * Query GUIDATA da rapportino_voci (non da interventi): il costo scala con quanti rapportino_voci
 * hanno le chiavi saracinesca valorizzate (poche centinaia), non con TUTTO lo storico completato
 * (potenzialmente decine di migliaia) — evita di avvicinarsi al timeout della function.
 */
export async function GET(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  try {
    // 1) rapportino_voci con ALMENO una delle due chiavi saracinesca valorizzata (due query
    //    separate: evita di introdurre una sintassi .or() composita senza precedenti nel repo).
    const [vociA, vociB] = await Promise.all([
      leggiVociConChiave('sostituzione_valvola'),
      leggiVociConChiave('sost_valvola'),
    ]);
    const voci = [...vociA, ...vociB];

    // 2) odl dei soli interventi COMPLETATI toccati sopra — query piccola: scala col numero di voci
    //    con saracinesca valorizzata, non con lo storico intero.
    const idsUnici = [...new Set(voci.map((v) => v.intervento_id).filter((id): id is string => !!id))];
    const odlById = new Map<string, string | null>();
    const IN_CHUNK = 200;
    for (let i = 0; i < idsUnici.length; i += IN_CHUNK) {
      const chunk = idsUnici.slice(i, i + IN_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl')
        .eq('stato', 'completato')
        .not('odl', 'is', null)
        .in('id', chunk);
      if (error) throw error;
      for (const row of (data ?? []) as InterventoRow[]) odlById.set(row.id, row.odl);
    }

    // 3) mappa alla shape attesa dalla funzione pura di aggregazione, escludendo le voci di
    //    interventi non completati/senza odl (assenti da odlById).
    const righeDb: RigaSaracinescaDb[] = [];
    for (const v of voci) {
      if (!v.intervento_id) continue;
      const odl = odlById.get(v.intervento_id);
      if (odl === undefined) continue;
      righeDb.push({
        odl,
        sostituzione_valvola: v.risposte?.['sostituzione_valvola'],
        sost_valvola: v.risposte?.['sost_valvola'],
      });
    }

    // 4) aggrega (funzione pura testata — INVARIATA)
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
