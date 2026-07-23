import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaFlussi, risolviCampiFlusso } from '@/lib/consuntivazione/flusso';
import { buildVoceConsuntivo } from '@/lib/consuntivazione/nuovoOrdine';
import { calcolaEsitazione } from '@/lib/consuntivazione/esita';
import { risolviEsecutori } from '@/lib/consuntivazione/esecutori';
import { indicizzaPositivi, chiavePositivo, normOdl } from '@/lib/interventi/odlPositivi';
import { sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { esitabileConsuntivo, notaNegativoMancante } from '@/lib/consuntivazione/statoEsito';
import { validaFotoObbligatorie, campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import { maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

const OPEN_STATES = ['da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione'];

type IntRow = {
  id: string; committente: string; odl: string | null; pdr: string | null; nominativo: string | null;
  indirizzo: string | null; comune: string | null; cap: string | null; matricola_contatore: string | null;
  intervento_tipo: string | null; gruppo_attivita: string | null; data: string; staff_id: string | null;
  territorio_id: string | null; fascia_oraria: string | null; stato: string;
};

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: { interventoId?: string; risposte?: Record<string, unknown>; esecutori?: Array<{ staff_id?: unknown }>; dataEsecuzione?: string; rapId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'payload non valido' }, { status: 400 }); }

  const interventoId = String(body.interventoId ?? '');
  if (!interventoId) return NextResponse.json({ error: 'interventoId mancante' }, { status: 400 });

  const { data: intRow } = await supabaseAdmin
    .from('interventi')
    .select('id, committente, odl, pdr, nominativo, indirizzo, comune, cap, matricola_contatore, intervento_tipo, gruppo_attivita, data, staff_id, territorio_id, fascia_oraria, stato')
    .eq('id', interventoId)
    .maybeSingle();
  if (!intRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const int = intRow as IntRow;
  if (!OPEN_STATES.includes(int.stato)) return NextResponse.json({ error: 'gia_esitato' }, { status: 409 });

  const esecutori = await risolviEsecutori(supabaseAdmin, body.esecutori);
  if (esecutori.length === 0) return NextResponse.json({ error: 'esecutori_mancanti' }, { status: 422 });

  const dataEsecuzione = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dataEsecuzione ?? '')) ? body.dataEsecuzione! : int.data;

  // Voce collegata (rapportino operatore) o nessuna → creiamo un contenitore.
  const { data: voceRow } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, rapportino_id, risposte, campi_snapshot, matricola, pdr, via, comune, odl, approvazione_stato')
    .eq('intervento_id', interventoId)
    .order('manuale', { ascending: true })
    .limit(1)
    .maybeSingle();
  const voce = voceRow as
    | { id: string; rapportino_id: string; risposte: Record<string, unknown> | null; campi_snapshot: unknown; matricola: string | null; pdr: string | null; via: string | null; comune: string | null; odl: string | null; approvazione_stato: string | null }
    | null;

  // Campi (azioni): dalla voce se già congelati, altrimenti dal flusso del gruppo.
  let campi = Array.isArray(voce?.campi_snapshot) && (voce!.campi_snapshot as unknown[]).length > 0
    ? (voce!.campi_snapshot as TemplateCampo[])
    : [];
  let templateId: string | null = null;
  let infoCampi: unknown = [];
  let tipo = 'standard';
  if (campi.length === 0) {
    const flussi = await caricaFlussi(supabaseAdmin);
    const r = risolviCampiFlusso(int.committente, int.gruppo_attivita, flussi);
    campi = r.campi; templateId = r.templateId; infoCampi = r.infoCampi; tipo = r.tipo;
  }
  if (campi.length === 0) return NextResponse.json({ error: 'nessun_flusso' }, { status: 422 });

  const risposteIn = maiuscolaRisposteTesto(body.risposte ?? {}, campi);
  const risposteFinali = mergeRisposte(voce?.risposte ?? {}, risposteIn, { soloCompletamentoFoto: false });

  // Serve un esito ESITABILE: positivo o negativo COMPLETO ("NO" richiede la nota, "NESSUN PASSAGGIO" no).
  if (!esitabileConsuntivo(risposteFinali, campi))
    return NextResponse.json(
      { error: notaNegativoMancante(risposteFinali, campi) ? 'nota_negativo' : 'esito_mancante' },
      { status: 422 },
    );

  const negativo = haEsitoNegativo(risposteFinali, campi);
  if (!negativo) {
    const slot = campiFoto(campi);
    const presenti = Object.fromEntries(slot.map((c) => {
      const v = risposteFinali[c.chiave];
      return [c.chiave, typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0];
    }));
    const val = validaFotoObbligatorie(campi, presenti, risposteFinali);
    if (!val.ok) return NextResponse.json({ error: 'foto_mancanti', mancanti: val.mancanti }, { status: 422 });
  }

  const nowIso = new Date().toISOString();
  const esecuzioneIso = `${dataEsecuzione}T12:00:00.000Z`;

  // Backstop doppio-positivo (escludendo QUESTO intervento).
  const odlNorm = normOdl(int.odl);
  let positivoOriginale = null as { id: string; data: string | null } | null;
  if (odlNorm) {
    const { data: pos } = await supabaseAdmin
      .from('interventi').select('id, odl, data, committente')
      .eq('esito', 'eseguito_positivo').eq('committente', int.committente).eq('odl', int.odl!);
    positivoOriginale = indicizzaPositivi((pos ?? []) as never).get(chiavePositivo(int.committente, int.odl)) ?? null;
  }

  const { patch, misuratore } = calcolaEsitazione({
    interventoId,
    committente: int.committente,
    interventoTipo: int.intervento_tipo,
    risposte: risposteFinali,
    campi,
    esecutori,
    consuntivatoDa: user.id,
    nowIso,
    esecuzioneIso,
    positivoOriginale,
    voce: {
      matricola: voce?.matricola ?? int.matricola_contatore,
      pdr: voce?.pdr ?? int.pdr,
      via: voce?.via ?? int.indirizzo,
      comune: voce?.comune ?? int.comune,
      odl: voce?.odl ?? int.odl,
    },
    rapportinoId: voce?.rapportino_id ?? null,
  });

  const primario = esecutori[0];

  // Voce: aggiorna quella esistente, oppure creane una contenitore (con rapportino contenitore).
  let rapIdEff = voce?.rapportino_id ?? null;
  if (voce) {
    const patchVoce: Record<string, unknown> = { risposte: risposteFinali };
    if (voce.approvazione_stato === 'in_attesa') patchVoce.approvazione_stato = 'approvato';
    await supabaseAdmin.from('rapportino_voci').update(patchVoce).eq('id', voce.id);
  } else {
    const rapId = body.rapId && /^[0-9a-fA-F-]{20,}$/.test(body.rapId) ? body.rapId : randomUUID();
    rapIdEff = rapId;
    const { error: eRap } = await supabaseAdmin.from('rapportini').insert({
      id: rapId, piano_id: null, staff_id: primario.staff_id, staff_name: primario.staff_name,
      data: dataEsecuzione, template_id: templateId, campi_snapshot: campi, info_snapshot: infoCampi ?? [],
      tipo: tipo ?? 'standard', token: randomBytes(24).toString('base64url'), stato: 'inviato',
      submitted_at: nowIso, expires_at: scadenzaIso(dataEsecuzione),
    });
    if (eRap) return NextResponse.json({ error: eRap.message }, { status: 500 });
    const nuovaVoce = {
      ...buildVoceConsuntivo({
        rapportinoId: rapId,
        committente: int.committente as CommittenteManuale,
        anagrafica: {
          nominativo: int.nominativo ?? undefined, matricola: int.matricola_contatore ?? undefined,
          pdr: int.pdr ?? undefined, odl: int.odl ?? undefined, via: int.indirizzo ?? undefined,
          comune: int.comune ?? undefined, cap: int.cap ?? undefined, attivita: int.intervento_tipo ?? undefined,
          fascia_oraria: int.fascia_oraria ?? undefined,
        },
        risposte: risposteFinali,
        campi,
      }),
      intervento_id: interventoId,
    };
    const { error: eVoce } = await supabaseAdmin.from('rapportino_voci').insert(nuovaVoce);
    if (eVoce) {
      await supabaseAdmin.from('rapportini').delete().eq('id', rapId);
      return NextResponse.json({ error: eVoce.message }, { status: 500 });
    }
  }

  // Intervento: applica il patch di esitazione.
  const updatePatch: Record<string, unknown> = {
    stato: patch.stato, esito: patch.esito, esito_motivo: patch.esito_motivo,
    chiuso_at: patch.chiuso_at, assegnato_at: patch.assegnato_at,
    consuntivato_da: patch.consuntivato_da, consuntivato_at: patch.consuntivato_at,
    esecutori: patch.esecutori, staff_id: patch.staff_id, voce: patch.voce,
    ...(patch.da_riconciliare ? { da_riconciliare: true, riconciliazione_rif_id: patch.riconciliazione_rif_id } : {}),
  };
  const { error: eInt } = await supabaseAdmin
    .from('interventi').update(updatePatch).eq('id', interventoId).in('stato', OPEN_STATES);
  if (eInt) return NextResponse.json({ error: eInt.message }, { status: 500 });

  if (misuratore) {
    await supabaseAdmin.from('misuratori_rimossi').upsert([{ ...misuratore, rapportino_id: rapIdEff }], { onConflict: 'intervento_id', ignoreDuplicates: true });
  }

  // Positivo registrato dal backoffice → sweep: revoca voci/interventi aperti con lo stesso
  // ODL negli altri rapportini (anche di piani futuri). Best-effort.
  if (patch.esito === 'eseguito_positivo' && patch.stato === 'completato') {
    try {
      await sweepDopoPositivi(supabaseAdmin, [interventoId]);
    } catch (e) {
      console.error('[consuntivazione/esita] sweep positivo fallito:', e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true, interventoId, esito: patch.esito, annullato: patch.stato === 'annullato' });
}
