// app/api/admin/interventi/storico/voce/[voceId]/route.ts
// GET/PATCH: modale di modifica voce (admin_plus o flag modificaInterventi). DELETE: solo admin_plus.
// Il cambio esecutore, dentro la stessa PATCH, è riservato agli admin_plus.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAssignableRole, canManageUsers, canEditStorico } from '@/lib/moduleAccess';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import { sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
import {
  buildCampiEditor, anagraficaPatchValida, anagraficaPatchIntervento, ANAGRAFICA_COLONNE, estraiFotoPaths,
} from '@/lib/interventi/storico/modifica';
import {
  esecutoreIdValido, scegliRapportinoDestinazione, prossimoOrdine, esecutoriConNuovoPrimario,
  type RapportinoCandidato,
} from '@/lib/interventi/storico/esecutore';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { risolviGruppo, buildTassonomiaIndex } from '@/lib/attivita/tassonomia';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
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
  'id, intervento_id, rapportino_id, risposte, odl, via, comune, attivita, matricola, pdr, nominativo, cap, fascia_oraria, campi_snapshot';

/** Campi della voce (flusso del suo gruppo attività) con fallback allo snapshot del rapportino. */
function campiEffettivi(voceSnap: unknown, rapSnap: unknown): TemplateCampo[] {
  return (Array.isArray(voceSnap) && voceSnap.length > 0 ? voceSnap : (rapSnap ?? [])) as TemplateCampo[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireEditStorico();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  const { data: voce } = await supabaseAdmin.from('rapportino_voci').select(VOCE_SELECT).eq('id', voceId).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as Record<string, unknown>;

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('campi_snapshot, staff_id, staff_name, data')
    .eq('id', v.rapportino_id as string).maybeSingle();
  const campi = buildCampiEditor(campiEffettivi(v.campi_snapshot, rap?.campi_snapshot));

  const anagrafica: Record<string, string | null> = {};
  for (const k of ANAGRAFICA_COLONNE) anagrafica[k] = (v[k] as string | null) ?? null;

  // Esecutore = staff del rapportino padre (è da lì che lo legge lo storico).
  const r = (rap ?? null) as { staff_id?: string | null; staff_name?: string | null; data?: string | null } | null;
  const esecutore = { staffId: r?.staff_id ?? null, nome: r?.staff_name ?? null, data: r?.data ?? null };

  return NextResponse.json({ anagrafica, risposte: (v.risposte ?? {}) as Record<string, unknown>, campi, esecutore });
}

/**
 * Sposta la voce (e riallinea l'intervento collegato) sotto un altro esecutore.
 *
 * Nello storico l'esecutore è lo staff del rapportino PADRE, quindi cambiarlo vuol dire
 * spostare la voce nel rapportino che il nuovo operatore ha per la STESSA data; se non ne ha
 * uno compatibile si crea un contenitore (piano_id null, già inviato), come fa la
 * consuntivazione. Il rapportino di partenza NON si tocca: contiene le altre voci di chi
 * l'ha compilato.
 *
 * Nota: la voce spostata resta agganciata al task del piano di origine. Rigenerare quel piano
 * dopo lo spostamento viene rifiutato da sincronizzaRapportini con `spostamento_completato`
 * (intervento completato sotto un operatore diverso da quello del task) — è il guard che
 * esiste apposta, e protegge la voce spostata dalla rigenerazione.
 */
async function cambiaEsecutore(
  voceId: string,
  esecutoreId: string,
): Promise<{ ok: true; spostata: boolean } | { ok: false; status: number; error: string }> {
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, intervento_id, rapportino_id').eq('id', voceId).maybeSingle();
  if (!voce) return { ok: false, status: 404, error: 'Voce non trovata.' };
  const v = voce as { intervento_id: string | null; rapportino_id: string };

  const { data: origine } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, data, piano_id, tipo, template_id, campi_snapshot, info_snapshot')
    .eq('id', v.rapportino_id).maybeSingle();
  if (!origine) return { ok: false, status: 404, error: 'Rapportino di origine non trovato.' };
  const src = origine as {
    staff_id: string; data: string; piano_id: string | null; tipo: string | null;
    template_id: string | null; campi_snapshot: unknown; info_snapshot: unknown;
  };
  if (src.staff_id === esecutoreId) return { ok: true, spostata: false };

  const { data: nuovo } = await supabaseAdmin
    .from('staff').select('id, display_name').eq('id', esecutoreId).maybeSingle();
  if (!nuovo) return { ok: false, status: 404, error: 'Operatore non trovato.' };
  const staffName = (nuovo as { display_name: string | null }).display_name ?? null;

  // Rapportino di destinazione: uno di quelli che l'operatore ha già per quel giorno…
  const { data: candidati } = await supabaseAdmin
    .from('rapportini').select('id, piano_id, tipo')
    .eq('staff_id', esecutoreId).eq('data', src.data)
    .order('created_at', { ascending: true });
  let destId = scegliRapportinoDestinazione((candidati ?? []) as RapportinoCandidato[], src);

  // …oppure un contenitore nuovo, con lo stesso modello dell'origine (stessi campi ⇒ le
  // risposte già compilate restano leggibili) e fuori dai piani, per non interferire con la
  // generazione dei rapportini di quel giorno.
  if (!destId) {
    const { data: creato, error: eRap } = await supabaseAdmin.from('rapportini').insert({
      piano_id: null, staff_id: esecutoreId, staff_name: staffName, data: src.data,
      template_id: src.template_id, campi_snapshot: src.campi_snapshot ?? [], info_snapshot: src.info_snapshot ?? [],
      tipo: src.tipo ?? 'standard', token: randomBytes(24).toString('base64url'),
      stato: 'inviato', submitted_at: new Date().toISOString(), expires_at: scadenzaIso(src.data),
    }).select('id').single();
    if (eRap) return { ok: false, status: 500, error: eRap.message };
    destId = (creato as { id: string }).id;
  }

  const { data: vociDest } = await supabaseAdmin
    .from('rapportino_voci').select('ordine').eq('rapportino_id', destId);
  const ordine = prossimoOrdine(((vociDest ?? []) as Array<{ ordine: number | null }>).map((x) => x.ordine));

  const { error: eVoce } = await supabaseAdmin
    .from('rapportino_voci').update({ rapportino_id: destId, ordine }).eq('id', voceId);
  if (eVoce) return { ok: false, status: 500, error: eVoce.message };

  // Intervento collegato: staff_id è l'esecutore primario, `esecutori` ne è lo specchio.
  if (v.intervento_id) {
    const { data: intervento } = await supabaseAdmin
      .from('interventi').select('esecutori').eq('id', v.intervento_id).maybeSingle();
    const squadra = esecutoriConNuovoPrimario(
      (intervento as { esecutori?: unknown } | null)?.esecutori,
      { staff_id: esecutoreId, staff_name: staffName },
    );
    const { error: eInt } = await supabaseAdmin
      .from('interventi')
      .update({ staff_id: esecutoreId, ...(squadra ? { esecutori: squadra } : {}) })
      .eq('id', v.intervento_id).neq('stato', 'annullato');
    if (eInt) return { ok: false, status: 500, error: eInt.message };

    // Registro misuratori rimossi: porta l'esecutore (nome) e il rapportino sul nuovo operatore.
    const { error: eMis } = await supabaseAdmin
      .from('misuratori_rimossi').update({ esecutore: staffName, rapportino_id: destId })
      .eq('intervento_id', v.intervento_id);
    if (eMis) console.error('[storico/voce] allineamento misuratori_rimossi fallito:', eMis.message);
  }

  return { ok: true, spostata: true };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireEditStorico();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  let body: { anagrafica?: unknown; risposte?: unknown; esecutoreId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body non valido.' }, { status: 400 }); }
  const anag = anagraficaPatchValida(body.anagrafica);
  const risposteIn = body.risposte && typeof body.risposte === 'object' ? (body.risposte as Record<string, unknown>) : null;
  const esecutoreId = esecutoreIdValido(body.esecutoreId);
  if ('esecutoreId' in body && body.esecutoreId != null && body.esecutoreId !== '' && !esecutoreId) {
    return NextResponse.json({ error: 'Esecutore non valido.' }, { status: 400 });
  }
  if (Object.keys(anag).length === 0 && !risposteIn && !esecutoreId) {
    return NextResponse.json({ error: 'Niente da aggiornare.' }, { status: 400 });
  }
  // Riassegnare un intervento a un altro operatore sposta lavoro (e compensi): solo admin_plus.
  if (esecutoreId) {
    const gatePlus = await requireAdminPlus();
    if (gatePlus instanceof NextResponse) return gatePlus;
  }

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, intervento_id, rapportino_id, risposte, campi_snapshot').eq('id', voceId).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as { intervento_id: string | null; rapportino_id: string; risposte: Record<string, unknown> | null; campi_snapshot?: unknown };

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('campi_snapshot').eq('id', v.rapportino_id).maybeSingle();
  const campi = campiEffettivi(v.campi_snapshot, rap?.campi_snapshot);

  const merged = risposteIn
    ? mergeRisposte(v.risposte ?? {}, risposteIn, { soloCompletamentoFoto: false })
    : (v.risposte ?? {});

  const voceUpdate: Record<string, unknown> = { ...anag };
  if (risposteIn) voceUpdate.risposte = merged;
  // Con il solo cambio esecutore non c'è nulla da riscrivere sulla voce: l'update vuoto si salta.
  if (Object.keys(voceUpdate).length > 0) {
    const { error: upErr } = await supabaseAdmin.from('rapportino_voci').update(voceUpdate).eq('id', voceId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Allinea l'intervento collegato (best-effort): anagrafica sempre (tranne annullato),
  // esito ripropagato solo se sono cambiate le risposte (come la route /api/admin/rapportini/voce).
  if (v.intervento_id) {
    try {
      const intAnag = anagraficaPatchIntervento(anag);
      // Coerenza tassonomia: se è stata modificata la descrizione attività, riscrivila
      // canonica e riallinea gruppo_attivita (stesso motore dell'import; evita tipo↔gruppo
      // incoerenti). Descrizione sconosciuta → lasciata grezza (edit admin, non bloccante).
      if ('attivita' in anag && anag.attivita) {
        try {
          const ris = risolviGruppo('altro', anag.attivita, buildTassonomiaIndex(await caricaTassonomia()), { allinea: 'scrittura' });
          if (ris) { intAnag.intervento_tipo = ris.descrizione; intAnag.gruppo_attivita = ris.gruppo; }
        } catch (e) {
          console.error('[storico/voce] risoluzione tassonomia fallita:', e instanceof Error ? e.message : String(e));
        }
      }
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
        // Positivo appena registrato → sweep delle voci/interventi aperti con lo stesso ODL altrove.
        if (!errInt && patch.azione === 'completa' && patch.esito === 'eseguito_positivo') {
          await sweepDopoPositivi(supabaseAdmin, [v.intervento_id]);
        }
      }
    } catch (e) {
      console.error('[storico/voce] propagazione fallita:', e instanceof Error ? e.message : String(e));
    }
  }

  // Per ultimo lo spostamento: anagrafica ed esito lavorano sul rapportino di partenza
  // (è da lì che arrivano i campi del flusso), quindi la voce si sposta a modifiche concluse.
  if (esecutoreId) {
    const esito = await cambiaEsecutore(voceId, esecutoreId);
    if (!esito.ok) return NextResponse.json({ error: esito.error }, { status: esito.status });
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
    .select('id, intervento_id, rapportino_id, richiesta_id, risposte, campi_snapshot')
    .eq('id', voceId)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as {
    intervento_id: string | null; rapportino_id: string; richiesta_id: string | null;
    risposte: Record<string, unknown> | null; campi_snapshot?: unknown;
  };

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('campi_snapshot').eq('id', v.rapportino_id).maybeSingle();
  const campiFoto = campiEffettivi(v.campi_snapshot, rap?.campi_snapshot).filter((c) => c.tipo === 'foto');

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
