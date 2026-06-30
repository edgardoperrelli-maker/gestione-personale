import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminPlus } from '@/lib/apiAuth';
import { caricaProduzioneEconomica } from '@/lib/produzione/load';

export const runtime = 'nodejs';

/** GET ?from&to (YYYY-MM-DD): produzione economica ACEA + SAL + scarto + audit a tre vie. */
export async function GET(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const dati = await caricaProduzioneEconomica(from, to);
    return NextResponse.json(dati, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore produzione economica.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
