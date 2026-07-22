import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sessionId } from '@/lib/assistenza/canale';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — rapportini del GIORNO CORRENTE su cui il back office può avviare l'assistenza.
 * Ritorna il `sid` (HMAC del token, calcolato server-side) e MAI il token grezzo: l'admin
 * raggiunge il canale `assist:<sid>` solo se il rapportino è di oggi ed è autenticato admin.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const oggi = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }); // YYYY-MM-DD

  const { data, error } = await supabaseAdmin
    .from('rapportini')
    .select('token, staff_name, data, stato')
    .eq('data', oggi)
    .order('staff_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rapportini = (data ?? [])
    .filter((r): r is { token: string; staff_name: string; data: string; stato: string } => Boolean(r.token))
    .map((r) => ({
      sid: sessionId(r.token),
      staff: r.staff_name,
      data: r.data,
      stato: r.stato,
    }));

  return NextResponse.json({ oggi, rapportini });
}
