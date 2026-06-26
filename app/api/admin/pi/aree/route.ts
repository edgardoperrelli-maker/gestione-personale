import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

type AreaRow = { codice: string; label: string; attiva: boolean; ordine: number; usa_contabilita?: boolean; in_attesa?: number };

/** Conteggio richieste P.I. in attesa per area (per il badge sulle card). */
async function contaInAttesaPerArea(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from('interventi_manuali')
    .select('area_codice')
    .eq('fonte', 'pronto_intervento')
    .eq('stato', 'in_attesa');
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ area_codice: string | null }>) {
    if (r.area_codice) counts[r.area_codice] = (counts[r.area_codice] ?? 0) + 1;
  }
  return counts;
}

/** GET: foglie territoriali (per le card del modulo) + conteggio richieste in attesa.
 *  Resiliente al caso in cui la migration `usa_contabilita` non sia ancora applicata:
 *  in quel caso ripiega su una select base e assume usa_contabilita=true. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const counts = await contaInAttesaPerArea();

  const full = await supabaseAdmin
    .from('pi_aree')
    .select('codice, label, attiva, ordine, usa_contabilita')
    .order('ordine');

  if (!full.error) {
    const aree = ((full.data ?? []) as AreaRow[]).map((a) => ({ ...a, in_attesa: counts[a.codice] ?? 0 }));
    return NextResponse.json({ aree });
  }

  // Fallback: colonna usa_contabilita assente → select base + default true.
  const base = await supabaseAdmin
    .from('pi_aree')
    .select('codice, label, attiva, ordine')
    .order('ordine');
  if (base.error) return NextResponse.json({ error: base.error.message }, { status: 500 });
  const aree: AreaRow[] = (base.data ?? []).map((a) => ({ ...(a as AreaRow), usa_contabilita: true, in_attesa: counts[(a as AreaRow).codice] ?? 0 }));
  return NextResponse.json({ aree });
}
