import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaReperibili } from '@/lib/pi/caricaReperibili';
import { reperibiliPerData, calcolaAnomaliaReperibilita } from '@/lib/pi/reperibili';
import { matricolaPatchMancante, PATCH_MATRICOLA_KEY } from '@/lib/pi/patch';
import { maiuscolo, maiuscolaStringhe, maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
import { richiestaPiToIntervento } from '@/lib/pi/richiestaPiToIntervento';
import type { DatiInterventoManuale } from '@/lib/interventi/manuali/types';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

type Body = {
  area_codice?: string;
  pi_token_id?: string | null;
  esecutoreStaffId?: string;
  esecutoreNome?: string;
  data?: string;
  anagrafica?: Record<string, unknown>;
  risposte?: Record<string, unknown>;
  note?: string;
};

/** POST: inserimento manuale P.I. dal backoffice → riga direttamente APPROVATA + intervento
 *  canonico (salta la coda). Il link è opzionale (menu a tendina lato UI, default sul link
 *  attivo). Riusa richiestaPiToIntervento come l'approvazione: un solo punto di scrittura. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const body = (await req.json()) as Body;

  const area_codice = String(body.area_codice ?? '').trim();
  const esecutoreStaffId = String(body.esecutoreStaffId ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!area_codice || !esecutoreStaffId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'campi_mancanti', dettaglio: 'Indicare area, esecutore e data.' }, { status: 422 });
  }
  if (matricolaPatchMancante(body.risposte)) {
    return NextResponse.json({ error: 'campi_mancanti', dettaglio: 'Indicare la matricola della patch.' }, { status: 422 });
  }

  // Link associato (opzionale): deve appartenere alla foglia. Da qui deriva il template.
  let pi_token_id: string | null = null;
  let template_id: string | null = null;
  if (body.pi_token_id) {
    const { data: tok } = await supabaseAdmin
      .from('pi_token')
      .select('id, area_codice, template_id')
      .eq('id', body.pi_token_id)
      .maybeSingle();
    if (tok && tok.area_codice === area_codice) {
      pi_token_id = tok.id;
      template_id = tok.template_id;
    }
  }
  // Template di default "Pronto Intervento" se non risolto dal link (per pulizia risposte).
  let campi: TemplateCampo[] = [];
  if (template_id) {
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('campi').eq('id', template_id).maybeSingle();
    campi = (tpl?.campi ?? []) as TemplateCampo[];
  } else {
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('id, campi').eq('nome', 'Pronto Intervento').maybeSingle();
    template_id = tpl?.id ?? null;
    campi = (tpl?.campi ?? []) as TemplateCampo[];
  }

  // Esecutore: nome dai reperibili se noto, sennò dal body; anomalia calcolata (informativa).
  const mappa = reperibiliPerData(await caricaReperibili(data, data, area_codice));
  const anomalia = calcolaAnomaliaReperibilita(esecutoreStaffId, data, mappa);
  const nomeDaMappa = (mappa[data] ?? []).find((r) => r.staffId === esecutoreStaffId)?.nome;
  const staffName = (nomeDaMappa ?? body.esecutoreNome ?? '').trim() || esecutoreStaffId;

  const anagrafica = maiuscolaStringhe(body.anagrafica ?? {});
  const risposte = maiuscolaRisposteTesto(body.risposte ?? {}, campi);
  if (typeof risposte[PATCH_MATRICOLA_KEY] === 'string') {
    risposte[PATCH_MATRICOLA_KEY] = (risposte[PATCH_MATRICOLA_KEY] as string).toUpperCase();
  }
  const dati = { committente: 'altro' as const, anagrafica, risposte };

  // 1) riga interventi_manuali direttamente approvata (deciso_da = ufficio).
  const id = randomUUID();
  const nowIso = new Date().toISOString();
  const { error: eManuale } = await supabaseAdmin.from('interventi_manuali').insert({
    id,
    pi_token_id,
    area_codice,
    staff_id: esecutoreStaffId,
    staff_name: staffName,
    committente: 'altro',
    template_id,
    data,
    dati_operatore: dati,
    dati_correnti: dati,
    note: maiuscolo(body.note ?? null),
    stato: 'approvato',
    fonte: 'pronto_intervento',
    anomalia_reperibilita: anomalia,
    deciso_da: user.id,
    deciso_at: nowIso,
  });
  if (eManuale) return NextResponse.json({ error: eManuale.message }, { status: 500 });

  // 2) intervento canonico (stesso builder dell'approvazione).
  const record = richiestaPiToIntervento(dati as DatiInterventoManuale, { data, staff_id: esecutoreStaffId });
  const { data: intRow, error: eInt } = await supabaseAdmin.from('interventi').insert(record).select('id').single();
  if (eInt) {
    // Compensazione: niente riga approvata orfana senza il suo canonico.
    await supabaseAdmin.from('interventi_manuali').delete().eq('id', id);
    return NextResponse.json({ error: eInt.message }, { status: 500 });
  }
  await supabaseAdmin.from('interventi_manuali').update({ intervento_id: intRow!.id }).eq('id', id);
  return NextResponse.json({ ok: true, id, interventoId: intRow!.id, anomalia_reperibilita: anomalia });
}
