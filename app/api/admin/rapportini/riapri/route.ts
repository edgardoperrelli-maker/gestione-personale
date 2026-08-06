import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { riagganciaVociAperte } from '@/lib/rapportini/riagganciaVoci';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

const Schema = z.object({ rapportinoId: z.string().uuid() });

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'rapportinoId non valido' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('rapportini')
    .update({ stato: 'in_corso', submitted_at: null, riaperto_at: new Date().toISOString() })
    .eq('id', parsed.data.rapportinoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Torna in mano all'operatore ADESSO: le voci prendono le azioni di oggi del loro gruppo,
  // non quelle congelate alla generazione. È l'unica via per un rapportino già scaduto —
  // riaprirlo — quando il flusso è cambiato dopo che il giro era partito.
  // Best-effort: la riapertura è già scritta, un errore qui non la annulla.
  let riagganciate = 0;
  try {
    riagganciate = (await riagganciaVociAperte(supabaseAdmin, new Date().toISOString(), {
      rapportiniIds: [parsed.data.rapportinoId],
    })).voci;
  } catch (e) {
    console.error('[rapportini/riapri] riaggancio voci al flusso corrente fallito:', e);
  }
  return NextResponse.json({ ok: true, ...(riagganciate ? { riagganciate } : {}) });
}
