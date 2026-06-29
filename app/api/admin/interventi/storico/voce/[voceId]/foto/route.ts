// app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts
// GET: anteprime foto di una voce (signed URL), lettura per utente del modulo.
// POST: upload foto aggiuntive (admin_plus o flag modificaInterventi) — voci manuali → interventi_manuali_foto,
//       voci standard → risposte.foto_extra. Le foto si leggono da 4 fonti.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { resolveAssignableRole, canEditStorico } from '@/lib/moduleAccess';
import { estraiFotoPaths } from '@/lib/interventi/storico/modifica';
import { rimuoviFotoDaRisposte } from '@/lib/interventi/storico/fotoModifica';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

const TTL = 60 * 10; // 10 minuti

/** Gate per upload foto: admin_plus OPPURE flag modificaInterventi. */
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

export async function GET(_req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { voceId } = await params;

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('risposte, rapportino_id, richiesta_id')
    .eq('id', voceId)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as { risposte: Record<string, unknown> | null; rapportino_id: string; richiesta_id: string | null };

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('campi_snapshot')
    .eq('id', v.rapportino_id)
    .maybeSingle();
  const campi = ((rap?.campi_snapshot ?? []) as TemplateCampo[]);

  const sorgenti: { etichetta: string; path: string }[] = [];

  // Fonte A: campi tipo='foto' nelle risposte della voce (path 'rapportini/…').
  sorgenti.push(...estraiFotoPaths(v.risposte, campi));

  // Fonte B: foto di intervento MANUALE collegate alla richiesta della voce.
  if (v.richiesta_id) {
    const { data: fm } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .select('slot_etichetta, storage_path')
      .eq('richiesta_id', v.richiesta_id)
      .order('created_at', { ascending: true });
    for (const f of (fm ?? []) as Array<{ slot_etichetta: string | null; storage_path: string }>) {
      if (f.storage_path) sorgenti.push({ etichetta: f.slot_etichetta ?? 'Foto', path: f.storage_path });
    }
  }

  // Fonte C: foto delle righe-misuratore collegate alla voce (risanamento).
  const campiMisuratore = campi.filter(
    (c) => c.tipo === 'foto' && ((c as { scope_foto?: string }).scope_foto ?? 'misuratore') === 'misuratore',
  );
  if (campiMisuratore.length > 0) {
    const { data: righe } = await supabaseAdmin
      .from('rapportino_righe')
      .select('risposte')
      .eq('voce_id', voceId);
    for (const r of (righe ?? []) as Array<{ risposte: Record<string, unknown> | null }>) {
      sorgenti.push(...estraiFotoPaths(r.risposte, campiMisuratore));
    }
  }

  // Fonte D: foto aggiuntive caricate da admin (chiave 'foto_extra' nelle risposte).
  for (const p of comeArrayFoto((v.risposte ?? {})['foto_extra'])) {
    sorgenti.push({ etichetta: 'Aggiuntiva', path: p });
  }

  // Dedup per path + signed URL (10 min). `path` torna al client per l'eventuale eliminazione.
  const seen = new Set<string>();
  const foto: Array<{ etichetta: string; fileName: string; url: string; path: string }> = [];
  for (const { etichetta, path } of sorgenti) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(path, TTL);
    if (signed?.signedUrl) {
      foto.push({ etichetta, fileName: path.split('/').pop() ?? path, url: signed.signedUrl, path });
    }
  }
  return NextResponse.json({ foto });
}

export async function POST(req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireEditStorico();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, richiesta_id, risposte').eq('id', voceId).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as { richiesta_id: string | null; risposte: Record<string, unknown> | null };

  const form = await req.formData();
  const files = form.getAll('file').filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length === 0) return NextResponse.json({ error: 'Nessun file.' }, { status: 400 });
  for (const f of files) {
    if (!f.type.startsWith('image/')) return NextResponse.json({ error: 'Tipo file non valido.' }, { status: 400 });
  }

  const folder = v.richiesta_id ? String(v.richiesta_id) : `extra/${voceId}`;
  const caricati: { path: string; file: File }[] = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${folder}/extra_${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto').upload(storagePath, buf, { contentType: file.type || 'image/jpeg', upsert: true });
    if (upErr) return NextResponse.json({ error: 'Upload fallito.' }, { status: 502 });
    caricati.push({ path: storagePath, file });
  }

  // Verifica persistenza (gotcha noto: upload può rispondere ok senza scrivere): tieni solo i presenti.
  const { data: listed } = await supabaseAdmin.storage.from('interventi-foto').list(folder, { limit: 1000 });
  const presenti = new Set((listed ?? []).map((o) => o.name));
  const ok = caricati.filter((c) => presenti.has(c.path.split('/').pop() ?? ''));
  if (ok.length === 0) return NextResponse.json({ error: 'Upload non persistito, riprova.' }, { status: 502 });

  try {
    if (v.richiesta_id) {
      const rows = ok.map(({ path, file }) => ({
        richiesta_id: v.richiesta_id,
        slot_chiave: 'extra',
        slot_etichetta: 'Foto aggiuntiva',
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || 'image/jpeg',
        size: file.size,
      }));
      const { error } = await supabaseAdmin.from('interventi_manuali_foto').insert(rows);
      if (error) throw error;
    } else {
      const merged = [...comeArrayFoto((v.risposte ?? {})['foto_extra']), ...ok.map((c) => c.path)];
      const risposte = { ...(v.risposte ?? {}), foto_extra: merged };
      const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
      if (error) throw error;
    }
  } catch (e) {
    // rollback storage best-effort
    await supabaseAdmin.storage.from('interventi-foto').remove(ok.map((c) => c.path)).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio foto.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: ok.length });
}

// DELETE: elimina una singola foto (per allineare/pulire storage dopo errori sul campo).
// Identifica la fonte del `path` tra le 4 (foto voce, manuale, righe-misuratore, foto_extra),
// rimuove il riferimento in DB e poi l'oggetto dallo storage. admin_plus o flag modificaInterventi.
export async function DELETE(req: Request, { params }: { params: Promise<{ voceId: string }> }) {
  const guard = await requireEditStorico();
  if (guard instanceof NextResponse) return guard;
  const { voceId } = await params;

  let body: { path?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body non valido.' }, { status: 400 }); }
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!path) return NextResponse.json({ error: 'Path foto mancante.' }, { status: 400 });

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, richiesta_id, risposte').eq('id', voceId).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as { richiesta_id: string | null; risposte: Record<string, unknown> | null };

  let rimosso = false;

  // Fonte B: foto di intervento MANUALE (riga interventi_manuali_foto). Lo scope richiesta_id
  // garantisce che il path appartenga a questa voce.
  if (v.richiesta_id) {
    const { data: del, error } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .delete()
      .eq('richiesta_id', v.richiesta_id)
      .eq('storage_path', path)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((del?.length ?? 0) > 0) rimosso = true;
  }

  // Fonte A/D: campi-foto e foto_extra nelle risposte della voce.
  if (!rimosso) {
    const res = rimuoviFotoDaRisposte(v.risposte, path);
    if (res.rimosso) {
      const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte: res.risposte }).eq('id', voceId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rimosso = true;
    }
  }

  // Fonte C: foto delle righe-misuratore collegate alla voce (risanamento).
  if (!rimosso) {
    const { data: righe } = await supabaseAdmin
      .from('rapportino_righe').select('id, risposte').eq('voce_id', voceId);
    for (const r of (righe ?? []) as Array<{ id: string; risposte: Record<string, unknown> | null }>) {
      const res = rimuoviFotoDaRisposte(r.risposte, path);
      if (!res.rimosso) continue;
      const { error } = await supabaseAdmin.from('rapportino_righe').update({ risposte: res.risposte }).eq('id', r.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rimosso = true;
    }
  }

  // Path non riferito da questa voce: niente da eliminare (no deletion arbitraria dallo storage).
  if (!rimosso) return NextResponse.json({ error: 'Foto non trovata per questo intervento.' }, { status: 404 });

  // Riferimento rimosso: ora pulisci lo storage (best-effort, il DB è già allineato).
  try {
    const { error } = await supabaseAdmin.storage.from('interventi-foto').remove([path]);
    if (error) console.error('[storico/voce/foto DELETE] rimozione storage fallita:', error.message);
  } catch (e) {
    console.error('[storico/voce/foto DELETE] rimozione storage fallita:', e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({ ok: true });
}
