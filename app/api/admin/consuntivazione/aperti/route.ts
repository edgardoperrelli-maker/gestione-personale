import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaFlussi, risolviCampiFlusso } from '@/lib/consuntivazione/flusso';
import { OPEN_STATES, APERTI_COLS, parseFiltriAperti, haFiltro, applicaFiltriAperti, type QueryFiltrabile } from '@/lib/consuntivazione/apertiFiltri';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

type InterventoAperto = {
  id: string;
  committente: string | null;
  odl: string | null;
  pdr: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  gruppo_attivita: string | null;
  data: string;
  staff_id: string | null;
  territorio_id: string | null;
  fascia_oraria: string | null;
};

/**
 * GET /api/admin/consuntivazione/aperti
 *  - con `id`: dettaglio del singolo ordine (azioni + eventuale voce esistente).
 *  - senza `id`: ricerca degli interventi aperti SOLO su richiesta esplicita — richiede almeno un
 *    filtro (nessun elenco di default). Filtri e esclusione contenitori in lib/consuntivazione/apertiFiltri.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) return dettaglio(id);

  const f = parseFiltriAperti(url.searchParams);
  // Nessun filtro → nessun risultato (l'elenco compare solo su ricerca esplicita).
  if (!haFiltro(f)) return NextResponse.json({ interventi: [], searched: false });

  const base = supabaseAdmin.from('interventi').select(APERTI_COLS);
  const filtrata = applicaFiltriAperti(base as unknown as QueryFiltrabile, f) as unknown as typeof base;
  const { data, error } = await filtrata.order('data', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interventi: (data ?? []) as InterventoAperto[], searched: true });
}

async function dettaglio(id: string): Promise<NextResponse> {
  const { data: intRow } = await supabaseAdmin
    .from('interventi')
    .select('id, committente, odl, pdr, nominativo, indirizzo, comune, cap, matricola_contatore, intervento_tipo, gruppo_attivita, data, staff_id, territorio_id, fascia_oraria, stato')
    .eq('id', id)
    .maybeSingle();
  if (!intRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const int = intRow as InterventoAperto & { stato: string };
  if (!OPEN_STATES.includes(int.stato))
    return NextResponse.json({ error: 'gia_esitato' }, { status: 409 });
  // Contenitore task-via (BONIFICHE EXTRA): non ha esito proprio, non è esitabile qui.
  if ((int.gruppo_attivita ?? '').trim().toUpperCase() === 'BONIFICHE EXTRA')
    return NextResponse.json({ error: 'contenitore_taskvia' }, { status: 409 });

  // Voce già collegata (rapportino operatore): ne riusiamo campi_snapshot + risposte + rapId.
  const { data: voceRow } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, rapportino_id, risposte, campi_snapshot')
    .eq('intervento_id', id)
    .order('manuale', { ascending: true })
    .limit(1)
    .maybeSingle();
  const voce = voceRow as { id: string; rapportino_id: string; risposte: Record<string, unknown> | null; campi_snapshot: unknown } | null;

  let campi = Array.isArray(voce?.campi_snapshot) && (voce!.campi_snapshot as unknown[]).length > 0
    ? (voce!.campi_snapshot as TemplateCampo[])
    : [];
  if (campi.length === 0) {
    const flussi = await caricaFlussi(supabaseAdmin);
    campi = risolviCampiFlusso(int.committente, int.gruppo_attivita, flussi).campi;
  }

  return NextResponse.json({
    intervento: int,
    voceId: voce?.id ?? null,
    rapId: voce?.rapportino_id ?? null,
    risposte: voce?.risposte ?? {},
    campi,
  });
}
