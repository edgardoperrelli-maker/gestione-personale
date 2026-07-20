import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import {
  buildRigaLimMassive,
  valoreSaracinesca,
  type RigaDb,
  type RigaLimMassive,
} from '@/lib/limitazione/exportLimMassive';

export const runtime = 'nodejs';

type InterventoRow = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null;
  committente: string | null;
  origine: string | null;
  staff_id: string | null;
  intervento_tipo: string | null;
  pdr: string | null;
  nominativo: string | null;
};

export async function GET(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    // 1) interventi limitazione lavorati nella finestra (paginazione: PostgREST taglia a 1000)
    const PAGE = 1000;
    const interventi: InterventoRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select(
          'id, odl, matricola_contatore, comune, indirizzo, esito, esito_motivo, stato, data, committente, origine, staff_id, intervento_tipo, pdr, nominativo',
        )
        .eq('stato', 'completato')
        .gte('data', from)
        .lte('data', to)
        // Fase 2 (spec 2026-07-20-fase2): selezione per TASSONOMIA, non per testo. Il match
        // ilike storico includeva per omonimia le attività DUNNING ("Limitazione flusso
        // idrico", ...) — estranee ai master per-comune e a rischio collisione matricola.
        // gruppo_attivita è garantito dai flussi (import validato, manuali a lista chiusa,
        // pianificazione soft + Guard 2) e dallo storico backfillato.
        .eq('gruppo_attivita', 'LIMITAZIONI MASSIVE')
        .order('data', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as InterventoRow[];
      interventi.push(...rows);
      if (rows.length < PAGE) break;
    }

    // 2) mappa staff_id → display_name
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staffById = new Map<string, string>();
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
      staffById.set(s.id, s.display_name);
    }

    // 3) mappa intervento_id → sigillo (rapportino_voci.risposte->>'sigillo')
    const IN_CHUNK = 200; // sotto il limite tipico di lunghezza URL per .in()
    const ids = interventi.map((i) => i.id);
    const sigilloById = new Map<string, string>();
    const saracinescaById = new Map<string, string>();
    const noteById = new Map<string, string>();
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      const { data: voci } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', chunk);
      for (const v of (voci ?? []) as Array<{
        intervento_id: string | null;
        risposte: Record<string, unknown> | null;
      }>) {
        if (!v.intervento_id) continue;
        const sig =
          v.risposte && typeof v.risposte['sigillo'] === 'string'
            ? (v.risposte['sigillo'] as string)
            : '';
        if (sig && !sigilloById.has(v.intervento_id)) sigilloById.set(v.intervento_id, sig);
        // saracinesca: primo valido tra sostituzione_valvola e sost_valvola (due template).
        // Tollerante al tipo: booleano (checkbox) → "SI", stringa → ripulita dai path-foto.
        const sar = valoreSaracinesca(
          v.risposte?.['sostituzione_valvola'],
          v.risposte?.['sost_valvola'],
        );
        if (sar && !saracinescaById.has(v.intervento_id)) saracinescaById.set(v.intervento_id, sar);
        // note: nota del rapportino (usata sui soli negativi, vedi buildRigaLimMassive)
        const nota =
          v.risposte && typeof v.risposte['note'] === 'string' ? (v.risposte['note'] as string) : '';
        if (nota.trim() && !noteById.has(v.intervento_id)) noteById.set(v.intervento_id, nota);
      }
    }

    // 4) costruisci le righe (funzione pura testata)
    const righe: RigaLimMassive[] = interventi.map((i) =>
      buildRigaLimMassive({
        id: i.id,
        odl: i.odl,
        matricola_contatore: i.matricola_contatore,
        comune: i.comune,
        indirizzo: i.indirizzo,
        esito: i.esito,
        esito_motivo: i.esito_motivo,
        stato: i.stato,
        data: i.data,
        committente: i.committente,
        origine: i.origine,
        display_name: i.staff_id ? staffById.get(i.staff_id) ?? null : null,
        sigillo: sigilloById.get(i.id) ?? null,
        pdr: i.pdr,
        nominativo: i.nominativo,
        saracinesca: saracinescaById.get(i.id) ?? null,
        note: noteById.get(i.id) ?? null,
      } satisfies RigaDb),
    );

    return NextResponse.json(
      { from, to, count: righe.length, righe },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
