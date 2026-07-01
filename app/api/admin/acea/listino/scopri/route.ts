import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminPlus } from '@/lib/apiAuth';
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';
import { voceDaAttivita, kpiCode } from '@/lib/produzione/voceDaAttivita';

export const runtime = 'nodejs';

const PAGE = 1000;
const COMMITTENTI = ['acea', 'lim_massive'];

/** intervento_tipo di tutti gli interventi ACEA/lim_massive (paginato). */
async function tipiInterventi(): Promise<string[]> {
  const out: string[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('intervento_tipo')
      .in('committente', COMMITTENTI)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{ intervento_tipo: string | null }>;
    for (const r of batch) if (r.intervento_tipo?.trim()) out.push(r.intervento_tipo);
    if (batch.length < PAGE) break;
  }
  return out;
}

/** attivita del master snapshot (paginato). */
async function attivitaMaster(): Promise<string[]> {
  const out: string[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('acea_master_snapshot')
      .select('attivita')
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{ attivita: string | null }>;
    for (const r of batch) if (r.attivita?.trim()) out.push(r.attivita);
    if (batch.length < PAGE) break;
  }
  return out;
}

/** POST: scopre le attività reali (interventi + master) e inserisce nel listino quelle mancanti a prezzo 0. */
export async function POST() {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  try {
    const [tipi, master, esistenti] = await Promise.all([
      tipiInterventi(),
      attivitaMaster(),
      supabaseAdmin.from('acea_listino').select('attivita').eq('committente', 'acea').not('attivita', 'is', null),
    ]);

    const gia = new Set<string>();
    for (const r of (esistenti.data ?? []) as Array<{ attivita: string | null }>) {
      if (r.attivita) gia.add(r.attivita);
    }

    // normalizza + dedup per chiave (prima etichetta vista vince)
    const daInserire = new Map<string, string>();
    for (const testo of [...tipi, ...master]) {
      const norm = normalizzaAttivita(testo);
      if (!norm || gia.has(norm.key) || daInserire.has(norm.key)) continue;
      daInserire.set(norm.key, norm.etichetta);
    }

    const oggi = new Date().toISOString().slice(0, 10);
    const righe = [...daInserire.entries()].map(([key, etichetta]) => {
      const voce = voceDaAttivita(etichetta);
      return {
        committente: 'acea',
        attivita: key,
        etichetta,
        voce,
        kpi: voce != null ? kpiCode(voce) : null,
        prezzo: 0,
        valido_dal: oggi,
      };
    });

    if (righe.length > 0) {
      const { error } = await supabaseAdmin.from('acea_listino').insert(righe);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ aggiunte: righe.length, gia: gia.size });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore scoperta attività.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
