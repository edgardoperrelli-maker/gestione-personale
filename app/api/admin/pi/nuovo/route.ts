import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { resolveInfoCampi } from '@/utils/rapportini/infoCampi';

export const runtime = 'nodejs';

/** GET: bootstrap della modale di inserimento manuale da backoffice — campi/infoCampi del
 *  template "Pronto Intervento" ed elenco completo degli operatori (per la tendina esecutore).
 *  L'anomalia reperibilità resta calcolata lato server al salvataggio. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { data: tpl } = await supabaseAdmin
    .from('rapportino_template')
    .select('campi, info_campi')
    .eq('nome', 'Pronto Intervento')
    .maybeSingle();
  const campi = (tpl?.campi ?? []) as unknown[];
  const infoCampi = resolveInfoCampi((tpl?.info_campi ?? []) as never);

  const { data: staffRows } = await supabaseAdmin
    .from('staff')
    .select('id, display_name');
  const operatori = ((staffRows ?? []) as Array<{ id: string; display_name: string | null }>)
    .map((s) => ({ staffId: s.id, nome: (s.display_name ?? '').trim() || s.id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  return NextResponse.json({ campi, infoCampi, operatori });
}
