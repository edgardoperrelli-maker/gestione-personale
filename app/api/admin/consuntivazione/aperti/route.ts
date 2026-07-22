import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaFlussi, risolviCampiFlusso } from '@/lib/consuntivazione/flusso';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/** Stati "aperti": interventi non ancora esitati (né completati né annullati). */
const OPEN_STATES = ['da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione'];

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
 *  - senza `id`: elenco degli interventi aperti (rimasti da esitare), filtrabili per `q`
 *    (odl/matricola/indirizzo/nominativo/pdr), finestra ultimi `giorni` (default 60), limite 200.
 *  - con `id`: dettaglio del singolo ordine — azioni del suo flusso + eventuale voce esistente
 *    (rapId + risposte già compilate).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) return dettaglio(id);

  const q = (url.searchParams.get('q') ?? '').trim();
  const giorni = Math.min(365, Math.max(1, Number(url.searchParams.get('giorni') ?? 60) || 60));
  const dal = new Date(Date.now() - giorni * 86_400_000).toISOString().slice(0, 10);

  let query = supabaseAdmin
    .from('interventi')
    .select('id, committente, odl, pdr, nominativo, indirizzo, comune, cap, matricola_contatore, intervento_tipo, gruppo_attivita, data, staff_id, territorio_id, fascia_oraria')
    .in('stato', OPEN_STATES)
    .gte('data', dal)
    .order('data', { ascending: false })
    .limit(200);
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `odl.ilike.${like},matricola_contatore.ilike.${like},indirizzo.ilike.${like},nominativo.ilike.${like},pdr.ilike.${like}`,
    );
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interventi: (data ?? []) as InterventoAperto[] });
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
