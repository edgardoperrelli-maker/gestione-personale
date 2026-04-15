import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'Missing date parameter' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, pdr, nome_cognome, indirizzo, cap, citta, lat, lng,
        data, fascia_oraria, tipo_intervento, territorio_id
      `)
      .eq('data', date)
      .order('data', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
