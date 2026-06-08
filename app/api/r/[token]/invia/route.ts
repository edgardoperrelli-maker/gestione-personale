import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { rapportinoInviabile } from '@/lib/interventi/manuali/rapportinoInviabile';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, staff_name, campi_snapshot, riaperto_at')
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

  const { error } = await supabaseAdmin.from('rapportini').update({ stato: 'inviato', submitted_at: new Date().toISOString() }).eq('id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    ? await supabaseAdmin.from('interventi').select('id, committente, voce').in('id', interventoIds)
    : { data: [] as Array<{ id: string; committente: string; voce: number | null }> };
  const committenteMap = new Map((interventiMeta ?? []).map(i => [i.id, i.committente as string]));
  const voceMap = new Map((interventiMeta ?? []).map(i => [i.id, i.voce as number | null]));

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

    // Raccolta misuratori rimossi (esito positivo + matricola presente)
    if (patch.esito === 'eseguito_positivo' && v.matricola && v.matricola.trim() && committenteMap.get(v.intervento_id) === 'acea' && voceMap.get(v.intervento_id) === 12) {
      misuratoriFermi.push({
        intervento_id:   v.intervento_id,
        rapportino_id:   rap.id,
        odl:             v.odl ?? null,
        data_esecuzione: (rap as { data: string }).data,
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
