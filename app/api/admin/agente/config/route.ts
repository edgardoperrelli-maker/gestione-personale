import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { validaConfig } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido.' }, { status: 400 });
  }

  const esito = validaConfig(body);
  if (!esito.ok) {
    return NextResponse.json({ error: esito.errore }, { status: 400 });
  }
  const v = esito.value;

  try {
    const { data, error } = await supabaseAdmin
      .from('agente_config')
      .update({
        enabled: v.enabled,
        giorni: v.giorni,
        ora: v.ora,
        dry_run: v.dry_run,
        finestra_giorni: v.finestra_giorni,
        mappatura: v.mappatura,
        esito_positivo: v.esito_positivo,
        esito_negativo: v.esito_negativo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultimo_giro_il, ultimo_contatto_il, ultima_rivendicazione_giorno, updated_at',
      )
      .single();
    if (error) throw error;

    return NextResponse.json({ config: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore salvataggio config.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
