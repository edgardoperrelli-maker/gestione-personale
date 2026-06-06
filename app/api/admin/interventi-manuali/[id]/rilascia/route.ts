import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  // Design: qualsiasi admin può rilasciare la presa in carico.
  // Modello informativo collaborativo (§9): niente scadenza, rilascio manuale/override tra i 4 admin.
  const { error } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ preso_in_carico_da: null, preso_in_carico_at: null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
