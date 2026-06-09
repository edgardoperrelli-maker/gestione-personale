import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { buildZipEntries, type FotoZip } from '@/lib/interventi/manuali/buildZipEntries';
import { nomeFotoFile, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;

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

  // ── 3. Fonte B: foto nei campi tipo='foto' delle voci (risposte[campo.chiave]) ─
  const fotoVoci: FotoZip[] = [];
  if (campiFoto.length > 0) {
    const { data: vociRows, error: vociErr } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, nominativo, matricola, pdr, odl, via, risposte')
      .eq('rapportino_id', rapportinoId)
      .order('ordine', { ascending: true });
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
      for (const campo of campiFoto) {
        const storagePath = (v.risposte ?? {})[campo.chiave];
        if (typeof storagePath !== 'string' || !storagePath) continue;
        const ext = storagePath.split('.').pop() ?? 'jpg';
        const fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
        // richiesta_id = voce id (usato da buildZipEntries per sottocartelle su collisione)
        fotoVoci.push({ richiesta_id: v.id, storage_path: storagePath, file_name: fileName });
      }
    }
  }

  // ── 4. Unisce le due fonti e verifica che ci sia almeno una foto ───────────────
  const tutteLePhoto = [...fotoManuali, ...fotoVoci];
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
  const fileName = `foto-rapportino-${rapportinoId}.zip`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  };
  if (saltate.length > 0) headers['X-Skipped-Photos'] = String(saltate.length);

  return new NextResponse(new Uint8Array(archive), { status: 200, headers });
}
