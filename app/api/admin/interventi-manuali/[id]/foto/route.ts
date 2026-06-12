import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const TTL = 60 * 10; // 10 minuti

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: foto, error } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('id, slot_etichetta, storage_path, file_name')
    .eq('richiesta_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: Array<{ id: string; etichetta: string; fileName: string; url: string | null }> = [];
  for (const f of (foto ?? []) as Array<{ id: string; slot_etichetta: string; storage_path: string; file_name: string }>) {
    const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(f.storage_path, TTL);
    out.push({ id: f.id, etichetta: f.slot_etichetta, fileName: f.file_name, url: signed?.signedUrl ?? null });
  }
  return NextResponse.json({ foto: out });
}
