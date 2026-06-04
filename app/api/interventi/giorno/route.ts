import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const COLONNE =
  'id, odl, nominativo, indirizzo, comune, cap, pdr, matricola_contatore, intervento_tipo, lat, lng, staff_id, stato, esito, esito_motivo, fascia_oraria, territorio_id';

/**
 * GET /api/interventi/giorno?data=YYYY-MM-DD
 * Admin-only. Ritorna { interventi: [...] } — tutti gli interventi del giorno
 * (ogni stato), nella forma attesa da TorreIntervento. Usato dalla torre
 * (polling/tasto) e dalla mappa di monitoraggio.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const data = searchParams.get('data') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json(
        { error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const { data: rows, error } = await supabase
      .from('interventi')
      .select(COLONNE)
      .eq('data', data)
      .order('comune', { ascending: true })
      .order('indirizzo', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ interventi: rows ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore caricamento interventi.' },
      { status: 500 },
    );
  }
}
