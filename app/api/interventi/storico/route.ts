// app/api/interventi/storico/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireUser } from '@/lib/apiAuth';
import { parseFiltriStorico } from '@/lib/interventi/storico/filtri';
import { slicePagina, calcolaContatori } from '@/lib/interventi/storico/normalizza';
import { caricaRigheStorico, caricaStaff } from '@/lib/interventi/storico/caricaStorico';
import type { RispostaStorico } from '@/lib/interventi/storico/types';

export const runtime = 'nodejs';

const PAGE_SIZE = 100;
const MAX_RIGHE = 8000;

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const f = parseFiltriStorico(searchParams);

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const staffById = await caricaStaff(supabase);
    const { righe, troncato } = await caricaRigheStorico(supabase, f, staffById, MAX_RIGHE);

    const total = righe.length;
    const contatori = calcolaContatori(righe);
    const pageRighe = slicePagina(righe, f.page, PAGE_SIZE);

    const risposta: RispostaStorico = { righe: pageRighe, total, troncato, pageSize: PAGE_SIZE, contatori };
    return NextResponse.json(risposta);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore caricamento storico.' },
      { status: 500 },
    );
  }
}
