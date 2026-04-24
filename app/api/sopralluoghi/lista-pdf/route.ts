import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createServerComponentClient({ cookies: cookieMethods });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const territorioId = searchParams.get('territorio_id');
    const activityId = searchParams.get('activity_id');
    const comune = searchParams.get('comune');
    const statoRegistrazione = searchParams.get('stato');

    let query = supabase
      .from('sopralluoghi_pdf_generati')
      .select('*')
      .order('data_generazione', { ascending: false });

    if (territorioId) {
      query = query.eq('territorio_id', territorioId);
    }

    if (activityId) {
      query = query.eq('activity_id', activityId);
    }

    if (comune) {
      query = query.eq('comune', comune.trim().toUpperCase());
    }

    if (statoRegistrazione) {
      query = query.eq('stato_registrazione', statoRegistrazione);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pdf_generati: data });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
