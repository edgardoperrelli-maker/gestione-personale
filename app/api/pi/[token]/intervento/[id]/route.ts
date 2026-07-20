import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { piTokenValido } from '@/lib/pi/tokenValidita';
import { caricaReperibili } from '@/lib/pi/caricaReperibili';
import { reperibiliPerData, calcolaAnomaliaReperibilita } from '@/lib/pi/reperibili';
import { matricolaPatchMancante, PATCH_MATRICOLA_KEY } from '@/lib/pi/patch';
import { maiuscolo, maiuscolaStringhe, maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

type Body = {
  esecutoreStaffId?: string;
  esecutoreNome?: string;
  data?: string;
  anagrafica?: Record<string, unknown>;
  risposte?: Record<string, unknown>;
  note?: string;
};

/** PUT pubblico (token = auth): l'operatore modifica una propria chiamata ancora `in_attesa`,
 *  possibile solo se il link è valido (stessa "porta" del "+"). Riusa la logica di create:
 *  esecutore/data dalla tendina, anomalia ricalcolata SEMPRE lato server. */
export async function PUT(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;

  const { data: tok } = await supabaseAdmin
    .from('pi_token')
    .select('id, area_codice, template_id, valido_dal, valido_al, revocato_at')
    .eq('token', token)
    .maybeSingle();
  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!piTokenValido(tok as { valido_dal: string; valido_al: string; revocato_at: string | null }, new Date().toISOString())) {
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  }

  // La riga deve appartenere a questo link ed essere ancora in_attesa.
  const { data: riga } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato')
    .eq('id', id)
    .eq('pi_token_id', tok.id)
    .eq('fonte', 'pronto_intervento')
    .maybeSingle();
  if (!riga) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (riga.stato !== 'in_attesa') return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const body = (await req.json()) as Body;
  const esecutoreStaffId = String(body.esecutoreStaffId ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!esecutoreStaffId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'campi_mancanti', dettaglio: 'Indicare esecutore e data della chiamata.' }, { status: 422 });
  }
  if (matricolaPatchMancante(body.risposte)) {
    return NextResponse.json({ error: 'campi_mancanti', dettaglio: 'Indicare la matricola della patch.' }, { status: 422 });
  }

  let campi: TemplateCampo[] = [];
  if (tok.template_id) {
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('campi').eq('id', tok.template_id).maybeSingle();
    campi = (tpl?.campi ?? []) as TemplateCampo[];
  }

  const mappa = reperibiliPerData(await caricaReperibili(data, data, tok.area_codice));
  const anomalia = calcolaAnomaliaReperibilita(esecutoreStaffId, data, mappa);
  const nomeDaMappa = (mappa[data] ?? []).find((r) => r.staffId === esecutoreStaffId)?.nome;
  const staffName = (nomeDaMappa ?? body.esecutoreNome ?? '').trim() || esecutoreStaffId;

  const anagrafica = maiuscolaStringhe(body.anagrafica ?? {});
  const risposte = maiuscolaRisposteTesto(body.risposte ?? {}, campi);
  if (typeof risposte[PATCH_MATRICOLA_KEY] === 'string') {
    risposte[PATCH_MATRICOLA_KEY] = (risposte[PATCH_MATRICOLA_KEY] as string).toUpperCase();
  }
  const dati = { committente: 'altro' as const, anagrafica, risposte };

  const { error } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      staff_id: esecutoreStaffId,
      staff_name: staffName,
      data,
      dati_operatore: dati,
      dati_correnti: dati,
      note: maiuscolo(body.note ?? null),
      anomalia_reperibilita: anomalia,
    })
    .eq('id', id)
    .eq('pi_token_id', tok.id)
    .eq('stato', 'in_attesa');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, anomalia_reperibilita: anomalia });
}
