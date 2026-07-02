import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminPlus } from '@/lib/apiAuth';
import { caricaCandeleSettimanali } from '@/lib/produzione/loadCandele';

export const runtime = 'nodejs';

const MAX_GIORNI = 6; // (to - from) massimo consentito: 7 giorni inclusi

/** GET ?from&to (YYYY-MM-DD, intervallo ≤7 giorni): candele settimanali per operatore (design 2026-07-02). */
export async function GET(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }
  const diffGiorni = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  if (diffGiorni < 0 || diffGiorni > MAX_GIORNI) {
    return NextResponse.json({ error: `Intervallo massimo ${MAX_GIORNI + 1} giorni (from..to).` }, { status: 400 });
  }

  try {
    const dati = await caricaCandeleSettimanali(from, to);
    return NextResponse.json(dati, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore candele settimanali.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
