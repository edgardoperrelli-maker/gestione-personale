import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminPlus } from '@/lib/apiAuth';
import { aliasKey } from '@/lib/produzione/attivitaCanonica';
import { attivitaDaClassificare, type AttivitaGrezza, type NuovaAliasRiga } from '@/lib/produzione/riconciliaAlias';

export const runtime = 'nodejs';

const PAGE = 1000;
// Committenti grezzi da cui possono arrivare attività (l'alias è per committente_orig).
const COMMITTENTI = ['acea', 'lim_massive', 'altro', 'italgas'];

async function attivitaGrezze(): Promise<AttivitaGrezza[]> {
  const out: AttivitaGrezza[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('committente, intervento_tipo')
      .in('committente', COMMITTENTI)
      .not('intervento_tipo', 'is', null)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as AttivitaGrezza[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function chiaviAlias(): Promise<Set<string>> {
  const set = new Set<string>();
  const { data, error } = await supabaseAdmin.from('acea_attivita_alias').select('committente_orig, chiave');
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ committente_orig: string; chiave: string }>) {
    set.add(aliasKey(r.committente_orig, r.chiave));
  }
  return set;
}

async function calcolaNuove(): Promise<NuovaAliasRiga[]> {
  const [grezze, chiavi] = await Promise.all([attivitaGrezze(), chiaviAlias()]);
  return attivitaDaClassificare(grezze, chiavi);
}

/** GET: anteprima delle attività non ancora mappate (non scrive nulla). */
export async function GET() {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  try {
    const nuove = await calcolaNuove();
    return NextResponse.json({ conteggio: nuove.length, nuove });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore riconciliazione attività.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: aggiunge le attività non mappate all'alias come "Da classificare".
 *  ignoreDuplicates → NON sovrascrive mai le classificazioni esistenti, aggiunge solo le nuove. */
export async function POST() {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;
  try {
    const nuove = await calcolaNuove();
    if (nuove.length > 0) {
      const { error } = await supabaseAdmin
        .from('acea_attivita_alias')
        .upsert(nuove, { onConflict: 'committente_orig,chiave', ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      aggiunte: nuove.length,
      attivita: nuove.map((n) => ({ committente: n.committente_orig, attivita: n.attivita_pulita })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore riconciliazione attività.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
