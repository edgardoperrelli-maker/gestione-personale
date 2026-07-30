import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { confrontaOdl, semaforo, ultimaRaccolta, type OdlStato } from '@/lib/acea/collaudo';
import { COMMITTENTI_ACEA } from '@/lib/acea/vociRapportino';

export const runtime = 'nodejs';

const PAGE = 1000;

/** Legge tutta una tabella a pagine: PostgREST taglia a 1000 righe e lo fa in silenzio. */
async function tutte<T>(tabella: string, colonne: string, ordina: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(tabella)
      .select(colonne)
      .order(ordina, { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const righe = (data ?? []) as unknown as T[];
    out.push(...righe);
    if (righe.length < PAGE) break;
  }
  return out;
}

/**
 * GET /api/acea/collaudo — il confronto oggettivo che deve precedere lo spegnimento del master.
 *
 * Due controlli con pesi diversi:
 *
 *  - **portale**: `acea_ordini` contro `acea_portale_snapshot`, cioè contro quello che l'agente
 *    legge dallo stesso Cruscotto da cui arriva l'export. È il confronto che decide: due letture
 *    indipendenti della stessa fonte devono coincidere.
 *  - **master**: `acea_ordini` contro le righe non esitate di `acea_master_snapshot`. Serve a
 *    CAPIRE la differenza, non a validarla — la colonna stato del master mescola stati ACEA,
 *    stati nostri, «DA CHIEDERE», celle vuote e 43 righe con `[object Object]`.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    type Ordine = { odl: string; aperto: boolean; famiglia: string; data_creazione: string };
    const ordini = await tutte<Ordine>('acea_ordini', 'odl, aperto, famiglia, data_creazione', 'odl');

    const modulo: OdlStato[] = ordini.map((o) => ({ odl: o.odl, aperto: o.aperto === true }));
    const date = ordini.map((o) => o.data_creazione).filter(Boolean).sort();

    // Portale: `stato_norm` è già normalizzato dall'agente. Chiuso = completato o annullato,
    // stessa regola per esclusione del modulo — un confronto fra due regole diverse non
    // proverebbe niente.
    type Portale = { odl: string; stato_norm: string | null; raccolto_at: string };
    const portale = await tutte<Portale>('acea_portale_snapshot', 'odl, stato_norm, raccolto_at', 'odl');
    const chiusiPortale = new Set(['COMPLETATO', 'ANNULLATO']);
    const daPortale: OdlStato[] = portale.map((p) => ({
      odl: p.odl,
      aperto: !chiusiPortale.has(String(p.stato_norm ?? '').trim().toUpperCase()),
    }));

    const raccoltoIl = ultimaRaccolta(portale);

    // Master: «non esitata» = colonna esito vuota. È il criterio del piano, ed è l'unico leggibile
    // su quella tabella.
    type Master = { odl: string; esito: string | null };
    const master = await tutte<Master>('acea_master_snapshot', 'odl, esito', 'odl');
    const daMaster: OdlStato[] = master.map((m) => ({
      odl: m.odl,
      aperto: String(m.esito ?? '').trim() === '',
    }));

    const cPortale = confrontaOdl(modulo, daPortale);
    const cMaster = confrontaOdl(modulo, daMaster);

    // Copertura del backfill.
    const conta = async (soloAgganciati: boolean) => {
      let q = supabaseAdmin
        .from('interventi')
        .select('id', { count: 'exact', head: true })
        .in('committente', [...COMMITTENTI_ACEA]);
      if (soloAgganciati) q = q.not('ordine_id', 'is', null);
      const { count } = await q;
      return count ?? 0;
    };

    const { data: ultimoImport } = await supabaseAdmin
      .from('acea_import')
      .select('nome_file, righe_totali, finestra_dal, finestra_al, caricato_il')
      .order('caricato_il', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json(
      {
        registro: {
          ordini: ordini.length,
          aperti: modulo.filter((m) => m.aperto).length,
          dunning: ordini.filter((o) => o.famiglia === 'dunning').length,
          massive: ordini.filter((o) => o.famiglia === 'massive').length,
          dal: date[0] ?? null,
          al: date[date.length - 1] ?? null,
        },
        ultimoImport: ultimoImport ?? null,
        backfill: {
          interventiAcea: await conta(false),
          agganciati: await conta(true),
        },
        portale: {
          ...cPortale,
          semaforo: semaforo(cPortale),
          raccoltoIl,
        },
        master: { ...cMaster, semaforo: semaforo(cMaster) },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore collaudo.' },
      { status: 500 },
    );
  }
}
