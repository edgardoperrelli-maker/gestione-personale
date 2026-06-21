import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data');
  const committente = searchParams.get('committente');
  const attivita = searchParams.get('attivita');

  // se richiesto, limita ai file della commessa/attività
  let fileFiltro: string[] | null = null;
  if (committente) {
    let cq = supabaseAdmin.from('agente_file_config').select('file').eq('committente', committente);
    if (attivita) cq = cq.eq('attivita', attivita);
    const { data: cfg } = await cq;
    fileFiltro = ((cfg ?? []) as { file: string }[]).map((c) => c.file);
    if (fileFiltro.length === 0) return NextResponse.json({ righe: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let q = supabaseAdmin
    .from('assegnazione_ai_log')
    .select('data_pianificata, comune, file, staff_name, n_interventi, creato_il')
    .order('creato_il', { ascending: false })
    .limit(100);
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) q = q.eq('data_pianificata', data);
  if (fileFiltro) q = q.in('file', fileFiltro);

  const { data: righe, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ righe: righe ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
