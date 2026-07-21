import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseFiltroLista } from '@/lib/interventi/manuali/listaQuery';
import { usernameFromEmail } from '@/lib/auth/usernameFromEmail';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const filtro = parseFiltroLista(new URL(req.url).searchParams);
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, rapportino_id, voce_id, parent_voce_id, intervento_id, staff_id, staff_name, committente, data, stato, corsia, dati_operatore, dati_correnti, note, motivo_rifiuto, created_at, preso_in_carico_da, preso_in_carico_at, deciso_da, deciso_at')
    // Le richieste di Pronto Intervento (fonte='pronto_intervento') vivono SOLO nel
    // modulo P.I., non nella Lista attesa dei rapportini.
    .neq('fonte', 'pronto_intervento')
    .order('created_at', { ascending: false });

  if (filtro.stato) q = q.eq('stato', filtro.stato);
  if (filtro.from) q = q.gte('data', filtro.from);
  if (filtro.to) q = q.lte('data', filtro.to);
  if (filtro.staff) q = q.eq('staff_id', filtro.staff);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Risolvi uuid→nome del backoffice che ha approvato/rifiutato (per il registro).
  // L'identità degli utenti vive in auth.users (la tabella profiles non è popolata):
  // lo username deriva dall'email `u_<username>@local.it`, come nel resto dell'app.
  const righe = (data ?? []) as Array<{ deciso_da: string | null }>;
  const decisoIds = new Set(righe.map((r) => r.deciso_da).filter((v): v is string => !!v));
  const nomi: Record<string, string> = {};
  if (decisoIds.size > 0) {
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
    for (const u of authData?.users ?? []) {
      if (decisoIds.has(u.id)) nomi[u.id] = usernameFromEmail(u.email) || u.id;
    }
  }
  const conNomi = righe.map((r) => ({ ...r, deciso_da_name: r.deciso_da ? (nomi[r.deciso_da] ?? null) : null }));
  return NextResponse.json({ richieste: conNomi });
}
