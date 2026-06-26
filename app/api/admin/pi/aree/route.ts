import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

type AreaRow = { codice: string; label: string; attiva: boolean; ordine: number; usa_contabilita?: boolean };

/** GET: foglie territoriali (per le card del modulo).
 *  Resiliente al caso in cui la migration `usa_contabilita` non sia ancora applicata:
 *  in quel caso ripiega su una select base e assume usa_contabilita=true. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const full = await supabaseAdmin
    .from('pi_aree')
    .select('codice, label, attiva, ordine, usa_contabilita')
    .order('ordine');

  if (!full.error) {
    return NextResponse.json({ aree: full.data ?? [] });
  }

  // Fallback: colonna usa_contabilita assente → select base + default true.
  const base = await supabaseAdmin
    .from('pi_aree')
    .select('codice, label, attiva, ordine')
    .order('ordine');
  if (base.error) return NextResponse.json({ error: base.error.message }, { status: 500 });
  const aree: AreaRow[] = (base.data ?? []).map((a) => ({ ...(a as AreaRow), usa_contabilita: true }));
  return NextResponse.json({ aree });
}
