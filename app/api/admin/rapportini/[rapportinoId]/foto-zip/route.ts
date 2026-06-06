import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { buildZipEntries, type FotoZip } from '@/lib/interventi/manuali/buildZipEntries';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;

  // 1) richieste manuali del rapportino
  const { data: richieste, error: reqErr } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id')
    .eq('rapportino_id', rapportinoId);
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });
  const ids = (richieste ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Nessun intervento manuale per questo rapportino.' }, { status: 404 });
  }

  // 2) foto di quelle richieste
  const { data: fotoRows, error: fotoErr } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('richiesta_id, storage_path, file_name')
    .in('richiesta_id', ids);
  if (fotoErr) return NextResponse.json({ error: fotoErr.message }, { status: 500 });
  const foto = (fotoRows ?? []) as FotoZip[];
  if (foto.length === 0) {
    return NextResponse.json({ error: 'Nessuna foto da scaricare.' }, { status: 404 });
  }

  // 3) calcola i path nello ZIP (gestione collisioni → sottocartelle)
  const entries = buildZipEntries(foto);

  // 4) scarica i blob dal bucket privato e impacchetta
  const zip = new JSZip();
  for (const e of entries) {
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .download(e.storagePath);
    if (dlErr || !blob) {
      return NextResponse.json({ error: `Download foto fallito: ${e.storagePath}` }, { status: 502 });
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    zip.file(e.zipPath, buf);
  }

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const fileName = `foto-rapportino-${rapportinoId}.zip`;
  return new NextResponse(new Uint8Array(archive), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
