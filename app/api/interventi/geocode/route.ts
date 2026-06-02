import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { geocodeIndirizzoServer } from '@/lib/interventi/geocodeServer';
import { statoDaRisultatoGeocode } from '@/lib/interventi/geocodeStatus';

export const runtime = 'nodejs';
// Geocoder a 1 req/sec: con limit basso ogni chiamata resta sotto i limiti serverless;
// maxDuration alza il tetto dove il piano lo consente (es. Vercel Pro).
export const maxDuration = 60;

function nrm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

type PendingRow = {
  id: string;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  geocode_attempts: number | null;
};

/**
 * POST /api/interventi/geocode — geocodifica un blocco di interventi non ancora
 * geocodificati (lat null, geocode_status diverso da 'failed').
 * Body JSON: { batchId?, data?, limit? }. Almeno uno tra batchId e data.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { batchId?: unknown; data?: unknown; limit?: unknown };
    const batchId = nrm(body.batchId);
    const data = nrm(body.data);
    const limit =
      typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0 && body.limit <= 100
        ? body.limit
        : 10;

    if (!batchId && !data) {
      return NextResponse.json({ error: 'Specificare batchId o data.' }, { status: 400 });
    }

    let q = supabaseAdmin
      .from('interventi')
      .select('id, indirizzo, comune, cap, geocode_attempts')
      .is('lat', null)
      .neq('geocode_status', 'failed')
      .not('indirizzo', 'is', null)
      .limit(limit);
    if (batchId) q = q.eq('import_batch_id', batchId);
    if (data) q = q.eq('data', data);

    const { data: rows, error } = await q;
    if (error) throw error;

    let ok = 0;
    let falliti = 0;
    const fallitiList: Array<{ id: string; indirizzo: string | null; comune: string | null; cap: string | null }> = [];

    for (const r of (rows ?? []) as PendingRow[]) {
      const coords = await geocodeIndirizzoServer(r.indirizzo ?? '', r.cap ?? '', r.comune ?? '');
      const stato = statoDaRisultatoGeocode(coords);
      const attempts = (r.geocode_attempts ?? 0) + 1;

      if (stato === 'ok' && coords) {
        const { error: ue } = await supabaseAdmin
          .from('interventi')
          .update({
            lat: coords.lat,
            lng: coords.lng,
            geocoded_at: new Date().toISOString(),
            geocode_status: 'ok',
            geocode_attempts: attempts,
          })
          .eq('id', r.id);
        if (ue) throw new Error(`Update intervento ${r.id} fallito: ${ue.message}`);
        ok += 1;
      } else {
        const { error: ue } = await supabaseAdmin
          .from('interventi')
          .update({ geocode_status: 'failed', geocode_attempts: attempts })
          .eq('id', r.id);
        if (ue) throw new Error(`Update intervento ${r.id} fallito: ${ue.message}`);
        falliti += 1;
        fallitiList.push({ id: r.id, indirizzo: r.indirizzo, comune: r.comune, cap: r.cap });
      }
    }

    // Stesso filtro della query a blocchi qui sopra, replicato per il conteggio dei restanti.
    let rq = supabaseAdmin
      .from('interventi')
      .select('id', { count: 'exact', head: true })
      .is('lat', null)
      .neq('geocode_status', 'failed')
      .not('indirizzo', 'is', null);
    if (batchId) rq = rq.eq('import_batch_id', batchId);
    if (data) rq = rq.eq('data', data);
    const { count, error: countError } = await rq;
    if (countError) throw new Error(countError.message);

    return NextResponse.json({
      processati: (rows ?? []).length,
      ok,
      falliti,
      restanti: count ?? 0,
      fallitiList,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore geocodifica.' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/interventi/geocode?batchId=&data= — elenca gli interventi con
 * geocodifica fallita nello scope, per la UI di correzione.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const batchId = nrm(url.searchParams.get('batchId'));
    const data = nrm(url.searchParams.get('data'));
    if (!batchId && !data) {
      return NextResponse.json({ error: 'Specificare batchId o data.' }, { status: 400 });
    }

    let q = supabaseAdmin
      .from('interventi')
      .select('id, indirizzo, comune, cap')
      .eq('geocode_status', 'failed');
    if (batchId) q = q.eq('import_batch_id', batchId);
    if (data) q = q.eq('data', data);

    const { data: rows, error } = await q.order('indirizzo', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ falliti: rows ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura falliti.' },
      { status: 500 },
    );
  }
}
