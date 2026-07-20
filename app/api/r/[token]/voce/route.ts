import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { maiuscolaRisposteTesto } from '@/lib/testo/maiuscolo';
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
  const colonne = 'id, intervento_id, raw_json, risposte, campi_snapshot';
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
    const vAny = voce as { intervento_id: string | null; raw_json: unknown };
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
      const found = resolve({
        staff_id: rapAny.staff_id,
        odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined),
        matricola: raw.matricola as string | null | undefined,
        pdr: raw.pdr as string | null | undefined,
      });
      if (found) {
        interventoId = found;
        await supabaseAdmin.from('rapportino_voci').update({ intervento_id: found }).eq('id', voceIdReale);
      }
    }

    if (interventoId) {
      const patch = patchInterventoLiveDaVoce(merged as Record<string, unknown>, campi);
      // 'completa' chiude l'intervento (qualsiasi stato tranne annullato).
      // 'riapri' annulla SOLO una nostra precedente chiusura: tocca l'intervento
      // solo se è 'completato', così non declassa stati intermedi gestiti da altri flussi.
      const interventoPatch =
        patch.azione === 'completa'
          ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() }
          : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null };
      const query = supabaseAdmin.from('interventi').update(interventoPatch).eq('id', interventoId);
      const { error: errInt } = await (patch.azione === 'completa'
        ? query.neq('stato', 'annullato')
        : query.eq('stato', 'completato'));
      if (errInt) console.error('[r/voce] propagazione intervento fallita:', errInt.message);
    }
  } catch (e) {
    console.error('[r/voce] propagazione/aggancio fallito:', e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
