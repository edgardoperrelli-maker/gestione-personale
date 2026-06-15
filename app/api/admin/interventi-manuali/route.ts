import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseFiltroLista } from '@/lib/interventi/manuali/listaQuery';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const filtro = parseFiltroLista(new URL(req.url).searchParams);
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, rapportino_id, voce_id, intervento_id, staff_id, staff_name, committente, data, stato, corsia, dati_operatore, dati_correnti, note, motivo_rifiuto, created_at, preso_in_carico_da, preso_in_carico_at, deciso_da, deciso_at')
    .order('created_at', { ascending: false });

  if (filtro.stato) q = q.eq('stato', filtro.stato);
  if (filtro.from) q = q.gte('data', filtro.from);
  if (filtro.to) q = q.lte('data', filtro.to);
  if (filtro.staff) q = q.eq('staff_id', filtro.staff);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Risolvi uuid→nome del backoffice che ha approvato/rifiutato (per il registro).
  const righe = (data ?? []) as Array<{ deciso_da: string | null }>;
  const decisoIds = [...new Set(righe.map((r) => r.deciso_da).filter((v): v is string => !!v))];
  const nomi: Record<string, string> = {};
  if (decisoIds.length > 0) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id, username').in('id', decisoIds);
    for (const p of (profs ?? []) as Array<{ id: string; username: string | null }>) {
      nomi[p.id] = p.username ?? p.id;
    }
  }
  const conNomi = righe.map((r) => ({ ...r, deciso_da_name: r.deciso_da ? (nomi[r.deciso_da] ?? null) : null }));
  return NextResponse.json({ richieste: conNomi });
}
