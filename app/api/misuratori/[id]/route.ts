import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { STATI_MISURATORE } from '@/types/misuratori';
import { requireUser } from '@/lib/apiAuth';
import { resolveAssignableRole } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });
  const body = await req.json() as Record<string, unknown>;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ('stato' in body) {
    if (!(STATI_MISURATORE as readonly string[]).includes(body.stato as string)) {
      return NextResponse.json({ error: 'stato non valido' }, { status: 400 });
    }
    // Regressione di stato (indietro nel flusso logistico) consentita SOLO ad admin_plus.
    // La distinzione "plus" vive in app_metadata.role (profiles è vuota).
    const isAdminPlus = resolveAssignableRole(null, auth.user.app_metadata?.role) === 'admin_plus';
    if (!isAdminPlus) {
      const { data: corrente } = await supabaseAdmin
        .from('misuratori_rimossi')
        .select('stato')
        .eq('id', id)
        .maybeSingle();
      if (corrente) {
        const currIdx = (STATI_MISURATORE as readonly string[]).indexOf(corrente.stato);
        const newIdx = (STATI_MISURATORE as readonly string[]).indexOf(body.stato as string);
        if (newIdx < currIdx) {
          return NextResponse.json(
            { error: 'Solo Admin Plus può riportare indietro lo stato di un misuratore.' },
            { status: 403 },
          );
        }
      }
    }
    patch.stato = body.stato;
  }

  if ('note' in body) {
    patch.note = typeof body.note === 'string' ? body.note || null : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('misuratori_rimossi')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
