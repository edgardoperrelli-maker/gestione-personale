import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { buildZipEntries, type FotoZip } from '@/lib/interventi/manuali/buildZipEntries';
import { nomeFotoFile, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;
  const voceId = new URL(req.url).searchParams.get('voceId');
  let voceForName: { via: string | null; odl: string | null } | null = null;

  // ── 1. Rapportino (serve campi_snapshot per individuare campi tipo='foto') ──────
  const { data: rap, error: rapErr } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot, template_id')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (rapErr) return NextResponse.json({ error: rapErr.message }, { status: 500 });
  if (!rap) return NextResponse.json({ error: 'rapportino non trovato' }, { status: 404 });

  const campiSnapshot = ((rap.campi_snapshot ?? []) as TemplateCampo[]).sort(
    (a, b) => a.ordine - b.ordine,
  );
  const campiFoto = campiSnapshot.filter((c) => c.tipo === 'foto');

  // Priorità nome foto: letta live dal template corrente. Template assente/cancellato o errore di lettura → default storico.
  let fotoPriority: FotoIdCampo[] = [];
  const templateId = (rap as { template_id?: string | null }).template_id;
  if (templateId) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('foto_id_priority')
      .eq('id', templateId)
      .maybeSingle();
    fotoPriority = ((tpl?.foto_id_priority ?? []) as FotoIdCampo[]);
  }

  // ── 2. Fonte A: foto da interventi manuali (tabella interventi_manuali_foto) ───
  const fotoManuali: FotoZip[] = [];
  if (!voceId) {
    const { data: richieste } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id')
      .eq('rapportino_id', rapportinoId);
    const richiestaIds = (richieste ?? []).map((r: { id: string }) => r.id);
    if (richiestaIds.length > 0) {
      const { data: fotoRows, error: fotoErr } = await supabaseAdmin
        .from('interventi_manuali_foto')
        .select('richiesta_id, storage_path, file_name')
        .in('richiesta_id', richiestaIds);
      if (fotoErr) return NextResponse.json({ error: fotoErr.message }, { status: 500 });
      fotoManuali.push(...((fotoRows ?? []) as FotoZip[]));
    }
  }

  // ── 3. Fonte B: foto nei campi tipo='foto' delle voci (risposte[campo.chiave]) ─
  const fotoVoci: FotoZip[] = [];
  if (campiFoto.length > 0) {
    let vociQuery = supabaseAdmin
      .from('rapportino_voci')
      .select('id, nominativo, matricola, pdr, odl, via, risposte')
      .eq('rapportino_id', rapportinoId);
    if (voceId) vociQuery = vociQuery.eq('id', voceId);
    const { data: vociRows, error: vociErr } = await vociQuery.order('ordine', { ascending: true });
    if (vociErr) return NextResponse.json({ error: vociErr.message }, { status: 500 });

    for (const v of (vociRows ?? []) as Array<{
      id: string;
      nominativo: string | null;
      matricola: string | null;
      pdr: string | null;
      odl: string | null;
      via: string | null;
      risposte: Record<string, unknown> | null;
    }>) {
      const ids = {
        pdr: v.pdr ?? undefined,
        matricola: v.matricola ?? undefined,
        odl: v.odl ?? undefined,
        indirizzo: v.via ?? undefined,
      };
      if (voceId && !voceForName) voceForName = { via: v.via, odl: v.odl };
      for (const campo of campiFoto) {
        const paths = comeArrayFoto((v.risposte ?? {})[campo.chiave]);
        paths.forEach((storagePath, i) => {
          const ext = storagePath.split('.').pop() ?? 'jpg';
          let fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
          if (paths.length > 1) fileName = fileName.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
          // richiesta_id = voce id (usato da buildZipEntries per sottocartelle su collisione)
          fotoVoci.push({ richiesta_id: v.id, storage_path: storagePath, file_name: fileName });
        });
      }
    }
  }

  // ── 3-bis. Fonte C: foto delle righe-misuratore (risanamento), scope='misuratore' ─
  const fotoRighe: FotoZip[] = [];
  if (!voceId) {
    const campiMisuratore = campiFoto.filter((c) => ((c as { scope_foto?: string }).scope_foto ?? 'misuratore') === 'misuratore');
    if (campiMisuratore.length > 0) {
      const { data: righeRows } = await supabaseAdmin
        .from('rapportino_righe')
        .select('id, matricola, pdr, nominativo, risposte')
        .eq('rapportino_id', rapportinoId)
        .order('ordine', { ascending: true });
      for (const r of (righeRows ?? []) as Array<{ id: string; matricola: string | null; pdr: string | null; nominativo: string | null; risposte: Record<string, unknown> | null }>) {
        const ids = { pdr: r.pdr ?? undefined, matricola: r.matricola ?? undefined };
        for (const campo of campiMisuratore) {
          const paths = comeArrayFoto((r.risposte ?? {})[campo.chiave]);
          paths.forEach((storagePath, i) => {
            const ext = storagePath.split('.').pop() ?? 'jpg';
            let fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
            if (paths.length > 1) fileName = fileName.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
            fotoRighe.push({ richiesta_id: r.id, storage_path: storagePath, file_name: fileName });
          });
        }
      }
    }
  }

  // ── 4. Unisce le fonti e verifica che ci sia almeno una foto ───────────────
  const tutteLePhoto = [...fotoManuali, ...fotoVoci, ...fotoRighe];
  if (tutteLePhoto.length === 0) {
    return NextResponse.json({ error: 'Nessuna foto da scaricare.' }, { status: 404 });
  }

  // ── 5. Calcola path ZIP (subfolder su collisione) e scarica dal bucket ────────
  const entries = buildZipEntries(tutteLePhoto);
  const zip = new JSZip();
  const saltate: string[] = [];

  for (const e of entries) {
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .download(e.storagePath);
    if (dlErr || !blob) {
      saltate.push(e.storagePath);
      continue; // salta (non interrompe) — lo ZIP conterrà le foto disponibili
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    zip.file(e.zipPath, buf);
  }

  // Se ogni foto è saltata → nessun file nel ZIP → errore
  if (saltate.length === entries.length) {
    return NextResponse.json({ error: 'nessuna_foto_scaricabile', saltate }, { status: 502 });
  }

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  let fileName = `foto-rapportino-${rapportinoId}.zip`;
  if (voceId) {
    const base = (voceForName?.via || voceForName?.odl || `voce-${voceId}`).replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    fileName = `foto-${base || 'voce'}.zip`;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  };
  if (saltate.length > 0) headers['X-Skipped-Photos'] = String(saltate.length);

  return new NextResponse(new Uint8Array(archive), { status: 200, headers });
}
