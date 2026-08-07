import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import { sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
import { valoreMatricolaNuova, propagaMatricolaNuovaARegistro } from '@/lib/acqualatina/matricolaNuova';
import { scriviSenzaColonnaMancante } from '@/lib/rapportini/colonneOpzionali';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { voceId, taskId, risposte } = await req.json();
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, campi_snapshot, staff_id, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString());
  // 'inviato' è ammesso ma SOLO per completare le foto pendenti (vedi mergeRisposte);
  // 'scaduto' resta bloccato (l'ufficio può riaprire).
  if (stato === 'scaduto')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const colonne = 'id, intervento_id, raw_json, risposte, campi_snapshot, odl, matricola, pdr';
  let { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select(colonne)
    .eq('id', voceId)
    .eq('rapportino_id', rap.id)
    .maybeSingle();
  // Riaggancio per chiave stabile: se l'`id` non esiste più (rapportino rigenerato dall'ufficio →
  // delete+insert → id nuovi) ma il client ha mandato il `taskId`, ritrova la voce per task_id.
  // Così i salvataggi in coda dell'operatore non vengono persi (niente 400 "voce_non_valida").
  if (!voce && typeof taskId === 'string' && taskId) {
    ({ data: voce } = await supabaseAdmin
      .from('rapportino_voci')
      .select(colonne)
      .eq('task_id', taskId)
      .eq('rapportino_id', rap.id)
      .maybeSingle());
  }
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  // L'id effettivo della voce (può differire da quello inviato dal client dopo una rigenerazione).
  const voceIdReale = (voce as { id: string }).id;

  // Campi della VOCE (flusso del suo gruppo attività) con fallback allo snapshot del
  // rapportino: servono sia per la normalizzazione MAIUSCOLO dei campi di testo, sia per
  // la propagazione live dell'esito.
  const campiVoceSnap = (voce as { campi_snapshot?: unknown }).campi_snapshot;
  const campi = (Array.isArray(campiVoceSnap) && campiVoceSnap.length > 0
    ? campiVoceSnap
    : ((rap as { campi_snapshot?: unknown }).campi_snapshot ?? [])) as TemplateCampo[];

  const esistenti = ((voce as { risposte: Record<string, unknown> | null }).risposte ?? {});
  const mergedRaw = mergeRisposte(esistenti, (risposte ?? {}) as Record<string, unknown>, {
    soloCompletamentoFoto: stato === 'inviato',
  });
  // DB pulito: i valori dei campi di testo vengono scritti SEMPRE in MAIUSCOLO
  // (select/crocetta/numero/foto restano intatti: opzioni fisse, booleani, numeri, percorsi).
  const merged = maiuscolaRisposteTesto(mergedRaw, campi);
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte: merged }).eq('id', voceIdReale);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Propagazione live SOLO sui salvataggi di un rapportino ancora modificabile:
  // su un 'inviato' stiamo solo completando foto pendenti, non si ri-propaga l'esito.
  if (stato === 'valido') try {
    const vAny = voce as { intervento_id: string | null; raw_json: unknown; odl: string | null; matricola: string | null; pdr: string | null };
    const rapAny = rap as { campi_snapshot: unknown; data: string; staff_id: string | null };
    let interventoId = vAny.intervento_id;

    // Auto-aggancio: se la voce è scollegata, la collega al volo (ODL/matricola/PDR)
    // agli interventi dell'operatore in quella data, e persiste il collegamento.
    if (!interventoId) {
      const raw = (vAny.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
      const { data: cand } = await supabaseAdmin
        .from('interventi')
        .select('id, staff_id, odl, matricola_contatore, pdr')
        .eq('staff_id', rapAny.staff_id)
        .eq('data', rapAny.data)
        .neq('stato', 'annullato');
      const resolve = buildVoceInterventoLinker((cand ?? []) as InterventoLinkRow[]);
      // Fallback alle COLONNE della voce, come fa la generazione: il caso 957327236
      // (2026-08-05) era una voce col raw_json senza chiavi utili ricollegabile solo
      // dall'odl di colonna — senza fallback restava orfana per sempre.
      const found = resolve({
        staff_id: rapAny.staff_id,
        odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? vAny.odl,
        matricola: (raw.matricola as string | null | undefined) ?? vAny.matricola,
        pdr: (raw.pdr as string | null | undefined) ?? vAny.pdr,
      });
      if (found) {
        interventoId = found;
        await supabaseAdmin.from('rapportino_voci').update({ intervento_id: found }).eq('id', voceIdReale);
      }
    }

    if (interventoId) {
      const patch = patchInterventoLiveDaVoce(merged as Record<string, unknown>, campi);
      // La matricola del misuratore INSTALLATO, se l'operatore l'ha appena scritta o
      // scansionata: viaggia nello stesso update, come pdr/nominativo alla pianificazione.
      //
      // Ma è un dato AcquaLatina, e si scrive sull'intervento SOLO se il lavoro è suo: è la
      // gemella della guardia che già protegge il registro (`propagaMatricolaNuovaARegistro`).
      // Qui mancava, e quando il modulo AcquaLatina è finito per ripiego sui giri ACEA e Italgas
      // (fallback alfabetico del rapportino, 07/2026) i valori digitati dagli operatori per
      // superare il campo obbligatorio — «0», «-», perfino matricole di contatori GAS — sono
      // atterrati su interventi di altri committenti, da dove l'export interventi li avrebbe
      // portati in un report del committente sbagliato.
      const matricolaNuovaRisposta = valoreMatricolaNuova((merged as Record<string, unknown>)['matricola_nuova']);
      let matricolaNuova: string | null = null;
      if (matricolaNuovaRisposta) {
        const { data: intRow } = await supabaseAdmin
          .from('interventi').select('committente').eq('id', interventoId).maybeSingle();
        const committente = (intRow as { committente: string | null } | null)?.committente ?? null;
        if (committente === 'acqualatina') matricolaNuova = matricolaNuovaRisposta;
        else console.warn('[r/voce] matricola_nuova ignorata: intervento non AcquaLatina', { interventoId, committente });
      }
      // 'completa' chiude l'intervento (qualsiasi stato tranne annullato).
      // 'riapri' annulla SOLO una nostra precedente chiusura: tocca l'intervento
      // solo se è 'completato', così non declassa stati intermedi gestiti da altri flussi.
      const interventoPatch = {
        ...(patch.azione === 'completa'
          ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() }
          : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null }),
        ...(matricolaNuova ? { matricola_nuova: matricolaNuova } : {}),
      };
      // `matricola_nuova` può non esistere ancora (migration non applicata prima del deploy):
      // senza questa guardia un intervento AcquaLatina non si chiuderebbe MAI finché la colonna
      // non arriva, perché l'update è uno solo con stato/esito/chiuso_at.
      const { error: errInt } = await scriviSenzaColonnaMancante(interventoPatch, 'matricola_nuova', (valori) => {
        const q = supabaseAdmin.from('interventi').update(valori).eq('id', interventoId);
        return patch.azione === 'completa' ? q.neq('stato', 'annullato') : q.eq('stato', 'completato');
      });
      if (errInt) console.error('[r/voce] propagazione intervento fallita:', errInt.message);
      // Positivo appena registrato → sweep: revoca voci/interventi aperti con lo stesso ODL
      // negli altri rapportini (anche di piani futuri già generati). Best-effort.
      if (!errInt && patch.azione === 'completa' && patch.esito === 'eseguito_positivo') {
        await sweepDopoPositivi(supabaseAdmin, [interventoId]);
      }
      // Il registro AcquaLatina la vuole anche lui (colonna «Matricola nuova» in griglia).
      if (!errInt && matricolaNuova) {
        await propagaMatricolaNuovaARegistro(supabaseAdmin, interventoId, matricolaNuova);
      }
    }
  } catch (e) {
    console.error('[r/voce] propagazione/aggancio fallito:', e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
