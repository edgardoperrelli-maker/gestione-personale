// POST /api/interventi/odl-bloccati — check proattivo della pianificazione: dati gli ODL
// dei task caricati, ritorna quelli GIÀ eseguiti positivi (quindi non affidabili: verranno
// esclusi da rapportini e torre al salvataggio). Invariante: lib/interventi/odlPositivi.ts.
// Body: { odls: string[], pianoId?: string } — pianoId esclude i positivi del piano stesso
// (in modifica di un piano già lavorato il suo positivo non è un blocco).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { caricaOdlGiaPositivi } from '@/lib/interventi/caricaOdlPositivi';
import { normOdl } from '@/lib/interventi/odlPositivi';

export const runtime = 'nodejs';

const MAX_ODLS = 5000; // guardia: ben oltre qualsiasi giro reale

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { odls?: unknown; pianoId?: unknown };
    const odls = (Array.isArray(body.odls) ? body.odls : [])
      .filter((x): x is string => typeof x === 'string')
      .slice(0, MAX_ODLS);
    const pianoId = typeof body.pianoId === 'string' && body.pianoId ? body.pianoId : undefined;
    if (odls.length === 0) return NextResponse.json({ bloccati: [] });

    const positivi = await caricaOdlGiaPositivi(supabaseAdmin, odls, { escludiPianoId: pianoId });
    const visti = new Set<string>();
    const bloccati: string[] = [];
    for (const o of odls) {
      const k = normOdl(o);
      if (k && positivi.has(k) && !visti.has(k)) {
        visti.add(k);
        bloccati.push(o.trim());
      }
    }
    return NextResponse.json({ bloccati });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore verifica ODL.' },
      { status: 500 },
    );
  }
}
