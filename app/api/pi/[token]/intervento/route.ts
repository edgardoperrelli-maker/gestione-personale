import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { piTokenValido } from '@/lib/pi/tokenValidita';
import { caricaReperibili, territoriDellArea } from '@/lib/pi/caricaReperibili';
import { reperibiliPerData, calcolaAnomaliaReperibilita } from '@/lib/pi/reperibili';
import { richiestaIdValido } from '@/lib/offline/idRichiesta';
import { maiuscolo, maiuscolaStringhe, maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

type Body = {
  richiestaId?: string;
  esecutoreStaffId?: string;
  esecutoreNome?: string;
  data?: string;
  anagrafica?: Record<string, unknown>;
  risposte?: Record<string, unknown>;
  note?: string;
};

/** POST pubblico (token = auth): carica una chiamata P.I. dal "+". La richiesta entra
 *  in coda di approvazione (stato 'in_attesa'). Esecutore e data dalla tendina reperibili;
 *  anomalia_reperibilita ricalcolata SEMPRE lato server. Idempotente su richiestaId. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: tok } = await supabaseAdmin
    .from('pi_token')
    .select('id, area_codice, template_id, valido_dal, valido_al, revocato_at')
    .eq('token', token)
    .maybeSingle();
  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!piTokenValido(tok as { valido_dal: string; valido_al: string; revocato_at: string | null }, new Date().toISOString())) {
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  }

  const body = (await req.json()) as Body;

  // Idempotenza: re-invio offline con id già esistente → ritorna l'esistente.
  if (richiestaIdValido(body.richiestaId)) {
    const { data: gia } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, anomalia_reperibilita')
      .eq('id', body.richiestaId)
      .maybeSingle();
    if (gia) return NextResponse.json({ id: gia.id, anomalia_reperibilita: gia.anomalia_reperibilita, idempotente: true });
  }

  const esecutoreStaffId = String(body.esecutoreStaffId ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!esecutoreStaffId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'campi_mancanti', dettaglio: 'Indicare esecutore e data della chiamata.' }, { status: 422 });
  }

  // Campi del template (per pulizia testo) + nome esecutore di fallback.
  let campi: TemplateCampo[] = [];
  if (tok.template_id) {
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('campi').eq('id', tok.template_id).maybeSingle();
    campi = ((tpl?.campi ?? []) as TemplateCampo[]);
  }

  // Anomalia: l'esecutore è reperibile in quella data nel territorio della foglia?
  const territoryIds = await territoriDellArea(tok.area_codice);
  const mappa = reperibiliPerData(await caricaReperibili(data, data, territoryIds));
  const anomalia = calcolaAnomaliaReperibilita(esecutoreStaffId, data, mappa);
  const nomeDaMappa = (mappa[data] ?? []).find((r) => r.staffId === esecutoreStaffId)?.nome;
  const staffName = (nomeDaMappa ?? body.esecutoreNome ?? '').trim() || esecutoreStaffId;

  const anagrafica = maiuscolaStringhe(body.anagrafica ?? {});
  const risposte = maiuscolaRisposteTesto(body.risposte ?? {}, campi);
  const dati = { committente: 'altro' as const, anagrafica, risposte };

  const id = richiestaIdValido(body.richiestaId) ? (body.richiestaId as string) : randomUUID();

  const { data: row, error } = await supabaseAdmin
    .from('interventi_manuali')
    .insert({
      id,
      pi_token_id: tok.id,
      area_codice: tok.area_codice,
      staff_id: esecutoreStaffId,
      staff_name: staffName,
      committente: 'altro',
      template_id: tok.template_id,
      data,
      dati_operatore: dati,
      dati_correnti: dati,
      note: maiuscolo(body.note ?? null),
      stato: 'in_attesa',
      fonte: 'pronto_intervento',
      anomalia_reperibilita: anomalia,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: row!.id, anomalia_reperibilita: anomalia });
}
