import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, risolviGruppo } from '@/lib/attivita/tassonomia';
import { caricaFlussi, risolviCampiFlusso } from '@/lib/consuntivazione/flusso';
import { buildInterventoConsuntivoBase, buildVoceConsuntivo } from '@/lib/consuntivazione/nuovoOrdine';
import { calcolaEsitazione } from '@/lib/consuntivazione/esita';
import { indicizzaPositivi, chiavePositivo, normOdl } from '@/lib/interventi/odlPositivi';
import { sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { esitabileConsuntivo, notaNegativoMancante } from '@/lib/consuntivazione/statoEsito';
import { validaFotoObbligatorie, campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { maiuscolaStringhe, maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
import { risolviEsecutori } from '@/lib/consuntivazione/esecutori';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
import type { NuovoOrdinePayload } from '@/lib/consuntivazione/types';

export const runtime = 'nodejs';

const COMMITTENTI: CommittenteManuale[] = ['acea', 'italgas', 'altro', 'lim_massive'];

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: NuovoOrdinePayload & { rapId?: string; territorioId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'payload non valido' }, { status: 400 });
  }

  const rapId = typeof body.rapId === 'string' && /^[0-9a-fA-F-]{20,}$/.test(body.rapId) ? body.rapId : randomUUID();
  const committente = body.committente;
  if (!committente || !COMMITTENTI.includes(committente))
    return NextResponse.json({ error: 'committente_non_valido' }, { status: 400 });

  const anagrafica = maiuscolaStringhe(body.anagrafica ?? {});
  const attivitaRaw = String((anagrafica as { attivita?: unknown }).attivita ?? '').trim();
  if (!attivitaRaw) return NextResponse.json({ error: 'attivita_obbligatoria' }, { status: 400 });

  const dataEsecuzione = String(body.dataEsecuzione ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEsecuzione))
    return NextResponse.json({ error: 'data_non_valida' }, { status: 400 });

  // Squadra: almeno un operatore; nomi risolti autorevolmente lato server dallo staff.
  const esecutori = await risolviEsecutori(supabaseAdmin, body.esecutori);
  if (esecutori.length === 0) return NextResponse.json({ error: 'esecutori_mancanti' }, { status: 422 });

  // Attività dentro la tassonomia (lista chiusa), come il "+" e l'approvazione.
  const indice = buildTassonomiaIndex(await caricaTassonomia());
  const rigaTass = risolviGruppo(committente, attivitaRaw, indice, { allinea: 'scrittura' });
  if (!rigaTass) return NextResponse.json({ error: 'attivita_sconosciuta', attivita: attivitaRaw }, { status: 400 });

  // Azioni del flusso del gruppo attività (motore Azioni operatori).
  const flussi = await caricaFlussi(supabaseAdmin);
  const { templateId, campi, infoCampi, tipo } = risolviCampiFlusso(committente, rigaTass.gruppo, flussi);
  if (campi.length === 0)
    return NextResponse.json({ error: 'nessun_flusso', dettaglio: 'Nessun flusso attivo per il gruppo attività.' }, { status: 422 });

  const risposte = maiuscolaRisposteTesto(body.risposte ?? {}, campi);

  // Serve un esito ESITABILE: positivo, oppure negativo COMPLETO. Un "NO" richiede la nota col
  // motivo (come l'operatore); "NESSUN PASSAGGIO" no. Assenza di esito = "da esitare".
  if (!esitabileConsuntivo(risposte, campi))
    return NextResponse.json(
      { error: notaNegativoMancante(risposte, campi) ? 'nota_negativo' : 'esito_mancante' },
      { status: 422 },
    );

  // Esito negativo → foto esonerate (come l'operatore).
  const negativo = haEsitoNegativo(risposte, campi);

  // Foto obbligatorie (esonerate su esito negativo, come l'operatore).
  if (!negativo) {
    const slot = campiFoto(campi);
    const presenti = Object.fromEntries(
      slot.map((c) => {
        const v = risposte[c.chiave];
        return [c.chiave, typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0];
      }),
    );
    const val = validaFotoObbligatorie(campi, presenti, risposte);
    if (!val.ok) return NextResponse.json({ error: 'foto_mancanti', mancanti: val.mancanti }, { status: 422 });
  }

  // Record intervento (anagrafica/classificazione) + esitazione (esito/attribuzione).
  (anagrafica as { attivita?: string }).attivita = attivitaRaw;
  const base = buildInterventoConsuntivoBase(committente, anagrafica, { data: dataEsecuzione, territorio_id: body.territorioId ?? null }, indice);
  const interventoId = randomUUID();
  const esecuzioneIso = `${dataEsecuzione}T12:00:00.000Z`;
  const nowIso = new Date().toISOString();

  // Backstop doppio-positivo: positivo già presente per (committente, ODL)?
  const odlNorm = normOdl(base.odl);
  let positivoOriginale = null as { id: string; data: string | null } | null;
  if (odlNorm) {
    const { data: pos } = await supabaseAdmin
      .from('interventi').select('id, odl, data, committente')
      .eq('esito', 'eseguito_positivo').eq('committente', base.committente).eq('odl', base.odl!);
    positivoOriginale = indicizzaPositivi((pos ?? []) as never).get(chiavePositivo(base.committente, base.odl)) ?? null;
  }

  const { patch, misuratore } = calcolaEsitazione({
    interventoId,
    committente: base.committente,
    interventoTipo: base.intervento_tipo,
    risposte,
    campi,
    esecutori,
    consuntivatoDa: user.id,
    nowIso,
    esecuzioneIso,
    positivoOriginale,
    voce: { matricola: base.matricola_contatore, pdr: base.pdr, via: base.indirizzo, comune: base.comune, odl: base.odl },
    rapportinoId: rapId,
  });

  const primario = esecutori[0];

  // 1) rapportino contenitore (piano_id null → invisibile alla pianificazione).
  const { error: eRap } = await supabaseAdmin.from('rapportini').insert({
    id: rapId,
    piano_id: null,
    staff_id: primario.staff_id,
    staff_name: primario.staff_name,
    data: dataEsecuzione,
    template_id: templateId,
    campi_snapshot: campi,
    info_snapshot: infoCampi ?? [],
    tipo: tipo ?? 'standard',
    token: randomBytes(24).toString('base64url'),
    stato: 'inviato',
    submitted_at: nowIso,
    expires_at: scadenzaIso(dataEsecuzione),
  });
  if (eRap) return NextResponse.json({ error: eRap.message }, { status: 500 });

  // 2) intervento (base anagrafica + patch esitazione).
  const record = {
    id: interventoId,
    ...base,
    stato: patch.stato,
    esito: patch.esito,
    esito_motivo: patch.esito_motivo,
    chiuso_at: patch.chiuso_at,
    assegnato_at: patch.assegnato_at,
    consuntivato_da: patch.consuntivato_da,
    consuntivato_at: patch.consuntivato_at,
    esecutori: patch.esecutori,
    staff_id: patch.staff_id,
    voce: patch.voce,
    piano_id: null,
    ...(patch.da_riconciliare ? { da_riconciliare: true, riconciliazione_rif_id: patch.riconciliazione_rif_id } : {}),
  };
  const { error: eInt } = await supabaseAdmin.from('interventi').insert(record);
  if (eInt) {
    await supabaseAdmin.from('rapportini').delete().eq('id', rapId);
    if (eInt.code === '23505') {
      return NextResponse.json({
        error: 'intervento_duplicato',
        messaggio: `Esiste già un intervento per ODL ${base.odl ?? '—'} in data ${dataEsecuzione} (${committente}).`,
      }, { status: 409 });
    }
    return NextResponse.json({ error: eInt.message }, { status: 500 });
  }

  // 3) voce contenitore collegata all'intervento.
  const voce = { ...buildVoceConsuntivo({ rapportinoId: rapId, committente, anagrafica, risposte, campi }), intervento_id: interventoId };
  const { error: eVoce } = await supabaseAdmin.from('rapportino_voci').insert(voce);
  if (eVoce) {
    await supabaseAdmin.from('interventi').delete().eq('id', interventoId);
    await supabaseAdmin.from('rapportini').delete().eq('id', rapId);
    return NextResponse.json({ error: eVoce.message }, { status: 500 });
  }

  // 4) registro misuratori (idempotente).
  if (misuratore) {
    await supabaseAdmin.from('misuratori_rimossi').upsert([misuratore], { onConflict: 'intervento_id', ignoreDuplicates: true });
  }

  // 5) positivo registrato dal backoffice → sweep: revoca voci/interventi aperti con lo
  // stesso ODL negli altri rapportini (anche di piani futuri). Best-effort.
  if (patch.esito === 'eseguito_positivo' && patch.stato === 'completato') {
    try {
      await sweepDopoPositivi(supabaseAdmin, [interventoId]);
    } catch (e) {
      console.error('[consuntivazione/nuovo] sweep positivo fallito:', e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({
    ok: true,
    interventoId,
    rapId,
    esito: patch.esito,
    annullato: patch.stato === 'annullato',
    esitoMotivo: patch.esito_motivo,
  });
}
