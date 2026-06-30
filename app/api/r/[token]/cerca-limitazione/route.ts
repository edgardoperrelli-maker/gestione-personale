import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';
import { matchVociMatricola } from '@/lib/limitazione/matchVociMatricola';
import { normMatricola, verdettoEsecuzione, type VerdettoEsecuzione } from '@/lib/limitazione/verdettoEsecuzione';

export const runtime = 'nodejs';

const COMMITTENTE_LIMITAZIONE = 'acea';
const CAMPI = 'id, matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

type RigaRef = {
  id: number; matricola: string; pdr: string | null; nominativo: string | null;
  indirizzo: string | null; civico: string | null; comune: string | null; cap: string | null;
};

/** Verdetto "già eseguita" per la matricola: fonte master (limitazione_misuratori_stato, riportata
 *  dall'agente al sync) OPPURE fonte DB (una voce di rapportino con esito positivo). */
async function leggiVerdetto(committente: string, q: string): Promise<VerdettoEsecuzione> {
  const qn = normMatricola(q);
  // Le due fonti sono indipendenti → in parallelo. La fonte DB usa un pre-filtro ampio (ilike '%q%')
  // e poi un confronto NORMALIZZATO lato JS (case/trattini/spazi), coerente con la fonte master.
  const [stRes, vociRes] = await Promise.all([
    supabaseAdmin.from('limitazione_misuratori_stato')
      .select('esito, stato_odl, odl, esecutore')
      .eq('committente', committente).eq('matricola_norm', qn).limit(1),
    supabaseAdmin.from('rapportino_voci')
      .select('odl, matricola, risposte')
      .ilike('matricola', `%${escLike(q)}%`).limit(100),
  ]);
  const statoMaster = (stRes.data && stRes.data[0]) || null;
  const vocePositivaDb = ((vociRes.data ?? []) as Array<{ odl: string | null; matricola: string | null; risposte: Record<string, unknown> | null }>)
    .find((v) => normMatricola(v.matricola ?? '') === qn && String(v.risposte?.['eseguito'] ?? '').trim().toUpperCase() === 'SI') ?? null;
  return verdettoEsecuzione({
    statoMaster,
    vocePositivaDb: vocePositivaDb ? { odl: vocePositivaDb.odl, data: null } : null,
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q obbligatorio' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at, piano_id, staff_id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  // Conflitto: stesso piano, altro operatore con quella matricola tra i suoi task.
  let altroOperatore: string | null = null;
  const pianoId = (rap as { piano_id?: string | null }).piano_id ?? null;
  const staffId = (rap as { staff_id?: string | null }).staff_id ?? '';
  if (pianoId) {
    const { data: altri } = await supabaseAdmin
      .from('rapportini').select('id, staff_name').eq('piano_id', pianoId).neq('staff_id', staffId);
    const nomePerRapp = new Map<string, string>(
      ((altri ?? []) as Array<{ id: string; staff_name: string | null }>).map((r) => [r.id, r.staff_name ?? '']),
    );
    if (nomePerRapp.size > 0) {
      const { data: vociAltri } = await supabaseAdmin
        .from('rapportino_voci').select('matricola, rapportino_id')
        .in('rapportino_id', [...nomePerRapp.keys()]).not('matricola', 'is', null).limit(2000);
      const hit = matchVociMatricola(
        ((vociAltri ?? []) as Array<{ matricola: string | null; rapportino_id: string }>)
          .map((v) => ({ id: v.rapportino_id, matricola: v.matricola })),
        q,
      );
      if (hit) altroOperatore = nomePerRapp.get(hit.id) || null;
    }
  }

  // Verdetto anti-duplicato (matricola già eseguita): valutato sempre, incluso in ogni risposta.
  const esecuzione = await leggiVerdetto(COMMITTENTE_LIMITAZIONE, q);

  // 1) match esatto
  const { data: esatti } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select(CAMPI)
    .eq('committente', COMMITTENTE_LIMITAZIONE)
    .eq('matricola', q)
    .limit(1);
  if (esatti && esatti.length > 0) {
    return NextResponse.json({ trovato: true, misuratore: esatti[0], altroOperatore, esecuzione });
  }

  // 2) nessun esatto → suggerimenti simili (bidirezionali):
  //    (a) pre-filtro SQL ilike '%q%' = "candidato contiene q": robusto anche su dataset grandi
  //        (caso del prefisso variabile, es. q=A023041 trova 99A023041).
  //    (b) campione ordinato del dataset acea (fino a 2000) per il caso inverso "q contiene candidato".
  //    La pura matricoleSimili decide ordine e taglio a 8 sull'unione deduplicata per id.
  const [resLike, resSample] = await Promise.all([
    supabaseAdmin.from('limitazione_misuratori_ref').select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE).ilike('matricola', `%${escLike(q)}%`).limit(50),
    supabaseAdmin.from('limitazione_misuratori_ref').select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE).order('matricola', { ascending: true }).limit(2000),
  ]);
  const perId = new Map<number, RigaRef>();
  for (const r of ([...(resLike.data ?? []), ...(resSample.data ?? [])] as RigaRef[])) perId.set(r.id, r);
  const suggerimenti = matricoleSimili(q, [...perId.values()], 8);
  return NextResponse.json({ trovato: false, suggerimenti, altroOperatore, esecuzione });
}
