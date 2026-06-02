import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { geocodeIndirizzoServer } from '@/lib/interventi/geocodeServer';

export const runtime = 'nodejs';
export const maxDuration = 60;

function nrm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * POST /api/interventi/geocode/retry — ri-geocodifica un intervento con indirizzo corretto.
 * Body JSON: { id, indirizzo, comune?, cap? }.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      indirizzo?: unknown;
      comune?: unknown;
      cap?: unknown;
    };
    const id = nrm(body.id);
    const indirizzo = nrm(body.indirizzo);
    const comune = nrm(body.comune);
    const cap = nrm(body.cap);

    if (!id) return NextResponse.json({ error: 'id mancante.' }, { status: 400 });
    if (!indirizzo) return NextResponse.json({ error: 'indirizzo mancante.' }, { status: 400 });

    const coords = await geocodeIndirizzoServer(indirizzo, cap ?? '', comune ?? '');

    if (!coords) {
      // Salva comunque l'indirizzo corretto; resta 'failed' per un nuovo tentativo.
      const { error: ue } = await supabaseAdmin
        .from('interventi')
        .update({ indirizzo, comune, cap, geocode_status: 'failed' })
        .eq('id', id);
      if (ue) throw new Error(`Update intervento ${id} fallito: ${ue.message}`);
      return NextResponse.json({ ok: false });
    }

    const { error: ue } = await supabaseAdmin
      .from('interventi')
      .update({
        indirizzo,
        comune,
        cap,
        lat: coords.lat,
        lng: coords.lng,
        geocoded_at: new Date().toISOString(),
        geocode_status: 'ok',
      })
      .eq('id', id);
    if (ue) throw new Error(`Update intervento ${id} fallito: ${ue.message}`);

    return NextResponse.json({ ok: true, lat: coords.lat, lng: coords.lng });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore retry geocodifica.' },
      { status: 500 },
    );
  }
}
