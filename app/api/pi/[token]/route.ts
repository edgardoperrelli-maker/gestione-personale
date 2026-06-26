import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { piTokenStato } from '@/lib/pi/tokenValidita';
import { caricaReperibili } from '@/lib/pi/caricaReperibili';
import { reperibiliPerData } from '@/lib/pi/reperibili';
import { resolveInfoCampi } from '@/utils/rapportini/infoCampi';

export const runtime = 'nodejs';

/** GET pubblico (token = auth): dati del link P.I., campi del template, reperibili
 *  della finestra (per la tendina, anche offline) e righe della sessione. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: tok } = await supabaseAdmin
    .from('pi_token')
    .select('id, area_codice, template_id, campi_snapshot, valido_dal, valido_al, note, revocato_at')
    .eq('token', token)
    .maybeSingle();
  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const statoCalcolato = piTokenStato(
    tok as { valido_dal: string; valido_al: string; revocato_at: string | null },
    new Date().toISOString(),
  );

  const { data: area } = await supabaseAdmin
    .from('pi_aree')
    .select('codice, label, attiva')
    .eq('codice', tok.area_codice)
    .maybeSingle();

  // Campi: dal template (live) con fallback allo snapshot del link.
  let campi = (tok.campi_snapshot ?? []) as unknown[];
  let infoCampiRaw: unknown[] = [];
  if (tok.template_id) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('campi, info_campi')
      .eq('id', tok.template_id)
      .maybeSingle();
    if (tpl) {
      if (Array.isArray(tpl.campi) && tpl.campi.length > 0) campi = tpl.campi as unknown[];
      infoCampiRaw = (tpl.info_campi ?? []) as unknown[];
    }
  }
  const infoCampi = resolveInfoCampi(infoCampiRaw as never);

  const reperibili = reperibiliPerData(await caricaReperibili(tok.valido_dal, tok.valido_al));

  const { data: righe } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, staff_name, data, stato, dati_correnti, anomalia_reperibilita, created_at')
    .eq('pi_token_id', tok.id)
    .eq('fonte', 'pronto_intervento')
    .order('created_at', { ascending: false });

  return NextResponse.json({
    token: { id: tok.id, area_codice: tok.area_codice, valido_dal: tok.valido_dal, valido_al: tok.valido_al, note: tok.note, statoCalcolato },
    area: area ?? null,
    campi,
    infoCampi,
    reperibili,
    righe: righe ?? [],
  });
}
