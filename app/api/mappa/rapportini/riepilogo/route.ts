import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { territorioEffettivo } from '@/utils/rapportini/territorioEffettivo';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get('from') ?? new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: raps } = await supabaseAdmin
    .from('rapportini')
    .select('id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at, riaperto_at, territorio_override')
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: false });
  const list = (raps ?? []) as Array<{
    id: string; piano_id: string; staff_id: string; staff_name: string | null;
    data: string; stato: string; token: string; expires_at: string; submitted_at: string | null; riaperto_at: string | null;
    territorio_override: string | null;
  }>;

  const pianoIds = [...new Set(list.map((r) => r.piano_id))];
  const rapIds = list.map((r) => r.id);
  const pianoInfoById: Record<string, { territorio: string | null; creato_at: string | null }> = {};
  const aiPianoIds = new Set<string>();
  const vociCount: Record<string, number> = {};
  const fotoSospese: Record<string, number> = {};

  // Le tre letture dipendono solo dalla lista rapportini e sono indipendenti tra
  // loro → in parallelo (prima erano in cascata). Conteggio voci + foto in sospeso
  // in UNA passata lato DB via RPC: prima si scansionava rapportino_voci due volte,
  // paginando a 1000 righe e conteggiando in JS (col JSONB `risposte`) → ~4,7s su
  // finestre di 30gg. La RPC ritorna solo i rapportini con almeno una voce; altri → 0.
  const [piani, aiLog, conteggi] = await Promise.all([
    pianoIds.length
      ? supabaseAdmin.from('mappa_piani').select('id, territorio, created_at').in('id', pianoIds).then((r) => r.data)
      : Promise.resolve(null),
    // Piani creati dall'agente (Assegnazione AI): presenti nello storico assegnazione_ai_log.
    pianoIds.length
      ? supabaseAdmin.from('assegnazione_ai_log').select('piano_id').in('piano_id', pianoIds).then((r) => r.data)
      : Promise.resolve(null),
    rapIds.length
      ? supabaseAdmin.rpc('riepilogo_conteggi_voci', { rap_ids: rapIds }).then((r) => r.data)
      : Promise.resolve(null),
  ]);

  (piani as Array<{ id: string; territorio: string | null; created_at: string | null }> | null ?? []).forEach((p) => {
    pianoInfoById[p.id] = { territorio: p.territorio ?? null, creato_at: p.created_at ?? null };
  });
  (aiLog as Array<{ piano_id: string | null }> | null ?? []).forEach((l) => { if (l.piano_id) aiPianoIds.add(l.piano_id); });
  (conteggi as Array<{ rapportino_id: string; n_voci: number; foto_in_sospeso: number }> | null ?? []).forEach((c) => {
    vociCount[c.rapportino_id] = Number(c.n_voci) || 0;
    fotoSospese[c.rapportino_id] = Number(c.foto_in_sospeso) || 0;
  });

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const nowIso = now.toISOString();
  const out = list.map((r) => ({
    ...r,
    territorio: territorioEffettivo(r.territorio_override, pianoInfoById[r.piano_id]?.territorio),
    territorio_override: r.territorio_override ?? null,
    piano_creato_at: pianoInfoById[r.piano_id]?.creato_at ?? null,
    aiCreato: aiPianoIds.has(r.piano_id),
    url: `${base}/r/${r.token}`,
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, nowIso),
    nVoci: vociCount[r.id] ?? 0,
    fotoInSospeso: fotoSospese[r.id] ?? 0,
  }));
  return NextResponse.json(out);
}
