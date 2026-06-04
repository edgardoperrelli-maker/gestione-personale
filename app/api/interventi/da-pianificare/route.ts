import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireUser } from '@/lib/apiAuth';
import { mapInterventoToTask, type InterventoGeoRow } from '@/lib/interventi/mappaInterventi';

export const runtime = 'nodejs';

const COMMITTENTI_VALIDI = ['acea', 'italgas', 'altro'];
const COLONNE =
  'id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria, staff_id, lat, lng, cap, pdr, matricola_contatore, intervento_tipo, codice_servizio, richiede_due_operatori, data, durata_stimata_min';

/**
 * GET /api/interventi/da-pianificare?data=YYYY-MM-DD&committente=acea
 * Ritorna { interventi: Task[] } — gli interventi geocodificati del giorno con
 * stato 'da_assegnare'|'assegnato', nella forma prodotta da parseExcelToTasks.
 * Lettura con RLS (client di sessione, non supabaseAdmin).
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const data = searchParams.get('data') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json(
        { error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' },
        { status: 400 },
      );
    }
    const committenteParam = searchParams.get('committente') ?? 'acea';
    const committente = COMMITTENTI_VALIDI.includes(committenteParam) ? committenteParam : 'acea';

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const { data: rows, error } = await supabase
      .from('interventi')
      .select(COLONNE)
      .eq('data', data)
      .eq('committente', committente)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .in('stato', ['da_assegnare', 'assegnato']);
    if (error) throw error;

    const interventi = ((rows ?? []) as unknown as InterventoGeoRow[]).map(mapInterventoToTask);
    return NextResponse.json({ interventi });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore caricamento interventi.' },
      { status: 500 },
    );
  }
}
