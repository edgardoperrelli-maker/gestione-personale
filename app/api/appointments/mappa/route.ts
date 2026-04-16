import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const territory_id = searchParams.get('territory_id');

    if (!date) {
      return NextResponse.json(
        { error: 'Missing date parameter' },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('appointments')
      .select(
        'id, pdr, nome_cognome, indirizzo, cap, citta, lat, lng, data, fascia_oraria, tipo_intervento, territorio_id'
      )
      .eq('data', date)
      .order('data', { ascending: true });

    if (territory_id) {
      query = query.eq('territorio_id', territory_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/appointments/mappa]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const res = NextResponse.json(data || []);
    // Cache 60s lato CDN/browser — gli appuntamenti cambiano raramente
    res.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );
    return res;
  } catch (error: any) {
    console.error('[GET /api/appointments/mappa] Exception:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
