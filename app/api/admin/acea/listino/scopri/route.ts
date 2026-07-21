import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminPlus } from '@/lib/apiAuth';
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';
import { voceDaAttivita, kpiCode } from '@/lib/produzione/voceDaAttivita';

export const runtime = 'nodejs';

/** attività canoniche ACEA dall'alias (committente effettivo 'acea', attive): sono già pulite/deframmentate. */
async function attivitaCanonicheAcea(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('acea_attivita_alias')
    .select('attivita_pulita')
    .eq('committente_eff', 'acea')
    .eq('attivo', true);
  if (error) throw error;
  const out: string[] = [];
  for (const r of (data ?? []) as Array<{ attivita_pulita: string | null }>) {
    if (r.attivita_pulita?.trim()) out.push(r.attivita_pulita);
  }
  return out;
}

/** POST: scopre le attività canoniche ACEA (dall'alias) e inserisce nel listino quelle mancanti a prezzo 0. */
export async function POST() {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  try {
    const [canoniche, esistenti] = await Promise.all([
      attivitaCanonicheAcea(),
      supabaseAdmin.from('acea_listino').select('attivita').eq('committente', 'acea').not('attivita', 'is', null),
    ]);

    const gia = new Set<string>();
    for (const r of (esistenti.data ?? []) as Array<{ attivita: string | null }>) {
      if (r.attivita) gia.add(r.attivita);
    }

    // normalizza + dedup per chiave (prima etichetta vista vince). "Sostituzione saracinesca" è una
    // voce a sé (dai master massive, Labico/Zagarolo) e va sempre a listino.
    const daInserire = new Map<string, string>();
    for (const testo of [...canoniche, 'Sostituzione saracinesca']) {
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
