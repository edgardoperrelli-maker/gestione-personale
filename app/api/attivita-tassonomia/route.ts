import 'server-only';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';

export const runtime = 'nodejs';

/** GET /api/attivita-tassonomia — righe per la validazione client (mappa) e le select del "+". */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const righe = await caricaTassonomia();
  return NextResponse.json({ righe }, { headers: { 'Cache-Control': 'no-store' } });
}
