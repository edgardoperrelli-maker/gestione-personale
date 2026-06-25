import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { rapportinoInviabile } from '@/lib/interventi/manuali/rapportinoInviabile';
import { righeIncomplete } from '@/utils/rapportini/righeIncomplete';
import { qualificaRimozioneMisuratore } from '@/lib/interventi/misuratoreRimosso';
import { ymdLocal } from '@/utils/date-it';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, staff_name, campi_snapshot, riaperto_at, tipo')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const { data: vociApprovazione } = await supabaseAdmin
    .from('rapportino_voci')
    .select('approvazione_stato')
    .eq('rapportino_id', rap.id);
  const gate = rapportinoInviabile(
    ((vociApprovazione ?? []) as Array<{ approvazione_stato: string | null }>),
  );
  if (!gate.inviabile)
    return NextResponse.json({ error: 'voci_in_sospeso', inSospeso: gate.inSospeso }, { status: 409 });

  // Risanamento: gate foto obbligatorie (righe misuratore + fasi civico).
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    const campiSnap = ((rap as { campi_snapshot?: unknown }).campi_snapshot ?? []) as TemplateCampo[];
    const [{ data: vRis }, { data: rRis }] = await Promise.all([
      supabaseAdmin.from('rapportino_voci').select('id, via, risposte').eq('rapportino_id', rap.id),
      supabaseAdmin.from('rapportino_righe').select('id, voce_id, matricola, risposte').eq('rapportino_id', rap.id),
    ]);
    const val = righeIncomplete((vRis ?? []) as never, (rRis ?? []) as never, campiSnap);
    if (!val.ok) return NextResponse.json({ error: 'foto_mancanti', dettagli: val.dettagli }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('rapportini').update({ stato: 'inviato', submitted_at: new Date().toISOString() }).eq('id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Risanamento: archivia i misuratori lavorati (righe con ref_id): copia ref→archivio + rimuovi da ref.
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    try {
      const { data: righeRef } = await supabaseAdmin
        .from('rapportino_righe').select('ref_id').eq('rapportino_id', rap.id).not('ref_id', 'is', null);
      const refIds = [...new Set(((righeRef ?? []) as Array<{ ref_id: number | null }>).map((r) => r.ref_id).filter((x): x is number => x != null))];
      if (refIds.length) {
        const { data: refs } = await supabaseAdmin
          .from('risanamento_misuratori_ref')
          .select('id, matricola, pdr, nominativo, indirizzo, civico, comune, cap, import_id')
          .in('id', refIds);
        if (refs && refs.length) {
          const archivio = (refs as Array<{ id: number; matricola: string; pdr: string | null; nominativo: string | null; indirizzo: string | null; civico: string | null; comune: string | null; cap: string | null; import_id: string | null }>).map((r) => ({
            matricola: r.matricola, pdr: r.pdr ?? '', nominativo: r.nominativo ?? '',
            indirizzo: r.indirizzo ?? '', civico: r.civico ?? '', comune: r.comune ?? '', cap: r.cap ?? '',
            import_id: r.import_id, ref_id_originale: r.id, rapportino_id: rap.id,
          }));
          await supabaseAdmin.from('risanamento_misuratori_archivio').insert(archivio);
          await supabaseAdmin.from('risanamento_misuratori_ref').delete().in('id', refs.map((r) => r.id));
        }
      }
    } catch (e) {
      console.error('[risanamento] archivio fallito (invio comunque ok):', e);
    }
  }

  // Unificazione: chiudi ogni intervento collegato con l'esito DELLA SUA voce (Fatto/Non fatto).
  // Annullati invariati; voci senza esito (neutro) non chiudono.
  const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
  const { data: voci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id, risposte, updated_at, matricola, pdr, odl, via, comune')
    .eq('rapportino_id', rap.id);
  const misuratoriFermi: Array<{
    intervento_id: string;
    rapportino_id: string;
    odl: string | null;
    data_esecuzione: string;
    esecutore: string | null;
    indirizzo: string | null;
    comune: string | null;
    matricola: string;
    pdr: string | null;
  }> = [];

  // Pre-fetch committente per escludere interventi non-ACEA dal registro
  const interventoIds = ((voci ?? []) as Array<{ intervento_id: string | null }>)
    .map(v => v.intervento_id)
    .filter((id): id is string => !!id);
  const { data: interventiMeta } = interventoIds.length > 0
    ? await supabaseAdmin.from('interventi').select('id, committente, intervento_tipo').in('id', interventoIds)
    : { data: [] as Array<{ id: string; committente: string; intervento_tipo: string | null }> };
  const committenteMap = new Map((interventiMeta ?? []).map(i => [i.id, i.committente as string]));
  const tipoMap = new Map((interventiMeta ?? []).map(i => [i.id, (i.intervento_tipo ?? '') as string]));

  for (const v of (voci ?? []) as Array<{
    intervento_id: string | null;
    risposte: Record<string, unknown> | null;
    updated_at: string;
    matricola: string | null;
    pdr: string | null;
    odl: string | null;
    via: string | null;
    comune: string | null;
  }>) {
    if (!v.intervento_id) continue;
    const patch = esitoInterventoDaVoce(v.risposte ?? {}, campi);
    if (!patch) continue;
    // chiuso_at = ora di compilazione della voce (updated_at), non l'ora di invio.
    await supabaseAdmin
      .from('interventi')
      .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: v.updated_at })
      .eq('id', v.intervento_id)
      .neq('stato', 'annullato');

    // Raccolta misuratori rimossi (esito positivo + matricola presente).
    // La "Rimozione impianto abusivo" è esclusa: non scarica un contatore (vedi
    // qualificaRimozioneMisuratore) e non deve confluire nel registro.
    if (patch.esito === 'eseguito_positivo' && v.matricola && v.matricola.trim() && committenteMap.get(v.intervento_id) === 'acea' && qualificaRimozioneMisuratore(tipoMap.get(v.intervento_id))) {
      misuratoriFermi.push({
        intervento_id:   v.intervento_id,
        rapportino_id:   rap.id,
        odl:             v.odl ?? null,
        // Data ESECUZIONE = momento reale di chiusura voce (chiuso_at = v.updated_at),
        // in fuso Europe/Rome. Fallback alla data del rapportino se assente.
        data_esecuzione: v.updated_at ? ymdLocal(new Date(v.updated_at)) : (rap as { data: string }).data,
        esecutore:       (rap as { staff_name?: string | null }).staff_name ?? null,
        indirizzo:       v.via ?? null,
        comune:          v.comune ?? null,
        matricola:       v.matricola.trim(),
        pdr:             v.pdr ?? null,
      });
    }
  }

  // Inserisci in misuratori_rimossi (idempotente: ON CONFLICT DO NOTHING)
  if (misuratoriFermi.length > 0) {
    await supabaseAdmin
      .from('misuratori_rimossi')
      .upsert(misuratoriFermi, { onConflict: 'intervento_id', ignoreDuplicates: true });
  }

  return NextResponse.json({ ok: true });
}
