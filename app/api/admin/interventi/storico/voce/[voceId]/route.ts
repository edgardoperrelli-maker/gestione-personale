// app/api/admin/interventi/storico/voce/[voceId]/route.ts
// GET/PATCH: modale di modifica voce (admin_plus o flag modificaInterventi). DELETE: solo admin_plus.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAssignableRole, canManageUsers, canEditStorico } from '@/lib/moduleAccess';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import {
  buildCampiEditor, unisciCampiTemplateLive, anagraficaPatchValida, anagraficaPatchIntervento, ANAGRAFICA_COLONNE, estraiFotoPaths,
} from '@/lib/interventi/storico/modifica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/** Gate forte admin_plus (pattern di app/api/admin/users/route.ts). */
async function requireAdminPlus(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Riservato agli Admin Plus.' }, { status: 403 });
  return true;
}

/** Gate per modifica/foto: admin_plus OPPURE flag modificaInterventi. NON copre la cancellazione. */
async function requireEditStorico(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canEditStorico(role, user.app_metadata))
    return NextResponse.json({ error: 'Non hai i permessi per modificare gli interventi.' }, { status: 403 });
  return true;
}

const VOCE_SELECT =
  'id, intervento_id, rapportino_id, risposte, odl, via, comune, attivita, matricola, pdr, nominativo, cap, fascia_oraria';

export async function GET(_req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireEditStorico();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  const { data: voce } = await supabaseAdmin.from('rapportino_voci').select(VOCE_SELECT).eq('id', voceId).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as Record<string, unknown>;

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('campi_snapshot, template_id').eq('id', v.rapportino_id as string).maybeSingle();

  // I campi modificabili sono quelli dello snapshot del rapportino UNITI ai campi
  // nuovi del template "live": così un campo aggiunto al template dopo la
  // pianificazione (es. 'sigillo' per le attività Acea) diventa compilabile anche
  // sugli interventi già pianificati. Lettura best-effort: se il template è stato
  // cancellato o la query fallisce, si ricade sul solo snapshot.
  let campiLive: TemplateCampo[] = [];
  const templateId = (rap as { template_id?: string | null } | null)?.template_id ?? null;
  if (templateId) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template').select('campi').eq('id', templateId).maybeSingle();
    campiLive = (tpl?.campi ?? []) as TemplateCampo[];
  }
  const campi = buildCampiEditor(
    unisciCampiTemplateLive((rap?.campi_snapshot ?? []) as TemplateCampo[], campiLive),
  );

  const anagrafica: Record<string, string | null> = {};
  for (const k of ANAGRAFICA_COLONNE) anagrafica[k] = (v[k] as string | null) ?? null;

  return NextResponse.json({ anagrafica, risposte: (v.risposte ?? {}) as Record<string, unknown>, campi });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireEditStorico();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  let body: { anagrafica?: unknown; risposte?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body non valido.' }, { status: 400 }); }
  const anag = anagraficaPatchValida(body.anagrafica);
  const risposteIn = body.risposte && typeof body.risposte === 'object' ? (body.risposte as Record<string, unknown>) : null;
  if (Object.keys(anag).length === 0 && !risposteIn) {
    return NextResponse.json({ error: 'Niente da aggiornare.' }, { status: 400 });
  }

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, intervento_id, rapportino_id, risposte').eq('id', voceId).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as { intervento_id: string | null; rapportino_id: string; risposte: Record<string, unknown> | null };

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('campi_snapshot').eq('id', v.rapportino_id).maybeSingle();
  const campi = ((rap?.campi_snapshot ?? []) as TemplateCampo[]);

  const merged = risposteIn
    ? mergeRisposte(v.risposte ?? {}, risposteIn, { soloCompletamentoFoto: false })
    : (v.risposte ?? {});

  const voceUpdate: Record<string, unknown> = { ...anag };
  if (risposteIn) voceUpdate.risposte = merged;
  const { error: upErr } = await supabaseAdmin.from('rapportino_voci').update(voceUpdate).eq('id', voceId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Allinea l'intervento collegato (best-effort): anagrafica sempre (tranne annullato),
  // esito ripropagato solo se sono cambiate le risposte (come la route /api/admin/rapportini/voce).
  if (v.intervento_id) {
    try {
      const intAnag = anagraficaPatchIntervento(anag);
      if (Object.keys(intAnag).length > 0) {
        await supabaseAdmin.from('interventi').update(intAnag).eq('id', v.intervento_id).neq('stato', 'annullato');
      }
      if (risposteIn) {
        const patch = patchInterventoLiveDaVoce(merged, campi);
        const interventoPatch = patch.azione === 'completa'
          ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() }
          : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null };
        const query = supabaseAdmin.from('interventi').update(interventoPatch).eq('id', v.intervento_id);
        const { error: errInt } = await (patch.azione === 'completa'
          ? query.neq('stato', 'annullato')
          : query.eq('stato', 'completato'));
        if (errInt) console.error('[storico/voce] propagazione esito fallita:', errInt.message);
      }
    } catch (e) {
      console.error('[storico/voce] propagazione fallita:', e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE: pulizia completa della riga. Elimina voce + intervento collegato +
// (se manuale) richiesta e foto, + righe-misuratore + foto dallo storage. Solo admin_plus.
export async function DELETE(_req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id, rapportino_id, richiesta_id, risposte')
    .eq('id', voceId)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as {
    intervento_id: string | null; rapportino_id: string; richiesta_id: string | null;
    risposte: Record<string, unknown> | null;
  };

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('campi_snapshot').eq('id', v.rapportino_id).maybeSingle();
  const campiFoto = ((rap?.campi_snapshot ?? []) as TemplateCampo[]).filter((c) => c.tipo === 'foto');

  // Raccoglie i path da rimuovere dallo storage (foto voce + richiesta manuale + righe).
  const storagePaths = new Set<string>();
  for (const { path } of estraiFotoPaths(v.risposte, campiFoto)) storagePaths.add(path);
  if (v.richiesta_id) {
    const { data: fm } = await supabaseAdmin
      .from('interventi_manuali_foto').select('storage_path').eq('richiesta_id', v.richiesta_id);
    for (const f of (fm ?? []) as Array<{ storage_path: string }>) if (f.storage_path) storagePaths.add(f.storage_path);
  }
  const { data: righe } = await supabaseAdmin
    .from('rapportino_righe').select('id, risposte').eq('voce_id', voceId);
  for (const r of (righe ?? []) as Array<{ risposte: Record<string, unknown> | null }>) {
    for (const { path } of estraiFotoPaths(r.risposte, campiFoto)) storagePaths.add(path);
  }

  // 1) storage (best-effort: non blocca la cancellazione DB).
  if (storagePaths.size > 0) {
    try { await supabaseAdmin.storage.from('interventi-foto').remove([...storagePaths]); }
    catch (e) { console.error('[storico/voce DELETE] rimozione foto fallita:', e instanceof Error ? e.message : String(e)); }
  }

  // 2) DB in ordine sicuro rispetto alle FK.
  try {
    if (v.richiesta_id) {
      await supabaseAdmin.from('interventi_manuali_foto').delete().eq('richiesta_id', v.richiesta_id);
      await supabaseAdmin.from('interventi_manuali').delete().eq('id', v.richiesta_id);
    }
    await supabaseAdmin.from('rapportino_righe').delete().eq('voce_id', voceId);
    const { error: delVoce } = await supabaseAdmin.from('rapportino_voci').delete().eq('id', voceId);
    if (delVoce) return NextResponse.json({ error: delVoce.message }, { status: 500 });
    if (v.intervento_id) await supabaseAdmin.from('interventi').delete().eq('id', v.intervento_id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore eliminazione.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
