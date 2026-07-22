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

const LIKE = (v: string) => `%${v.replace(/[%_]/g, (m) => `\\${m}`)}%`;

/**
 * GET /api/admin/consuntivazione/aperti
 *  - con `id`: dettaglio del singolo ordine (azioni + eventuale voce esistente).
 *  - senza `id`: ricerca degli interventi aperti SOLO su richiesta esplicita — richiede almeno un
 *    filtro (nessun elenco di default). Filtri: committente, gruppo (gruppo_attivita),
 *    attivita (intervento_tipo), operatore (staff_id), dal/al (data), odl, pdr, via (indirizzo).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) return dettaglio(id);

  const p = url.searchParams;
  const f = {
    committente: (p.get('committente') ?? '').trim(),
    gruppo: (p.get('gruppo') ?? '').trim(),
    attivita: (p.get('attivita') ?? '').trim(),
    operatore: (p.get('operatore') ?? '').trim(),
    dal: (p.get('dal') ?? '').trim(),
    al: (p.get('al') ?? '').trim(),
    odl: (p.get('odl') ?? '').trim(),
    pdr: (p.get('pdr') ?? '').trim(),
    via: (p.get('via') ?? '').trim(),
  };
  // Nessun filtro → nessun risultato (l'elenco compare solo su ricerca esplicita).
  if (!Object.values(f).some(Boolean)) return NextResponse.json({ interventi: [], searched: false });

  let query = supabaseAdmin
    .from('interventi')
    .select('id, committente, odl, pdr, nominativo, indirizzo, comune, cap, matricola_contatore, intervento_tipo, gruppo_attivita, data, staff_id, territorio_id, fascia_oraria')
    .in('stato', OPEN_STATES)
    .order('data', { ascending: false })
    .limit(200);

  if (f.committente) query = query.eq('committente', f.committente);
  if (f.gruppo) query = query.eq('gruppo_attivita', f.gruppo);
  if (f.attivita) query = query.ilike('intervento_tipo', f.attivita); // ilike senza wildcard = uguaglianza case-insensitive
  if (f.operatore) query = query.eq('staff_id', f.operatore);
  if (f.dal) query = query.gte('data', f.dal);
  if (f.al) query = query.lte('data', f.al);
  if (f.odl) query = query.ilike('odl', LIKE(f.odl));
  if (f.pdr) query = query.ilike('pdr', LIKE(f.pdr));
  if (f.via) query = query.ilike('indirizzo', LIKE(f.via));

  const { data, error } = await query;
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
