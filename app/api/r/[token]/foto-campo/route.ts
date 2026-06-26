import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { nomeFileFoto } from './idempotenza';

export const runtime = 'nodejs';

/**
 * GET /api/r/[token]/foto-campo?path=rapportini/<id>/<file>
 * Restituisce (via redirect) un URL firmato per visualizzare una foto del rapportino.
 * Sicurezza: il path deve appartenere a QUESTO rapportino (prefisso rapportini/<id>/).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = new URL(req.url).searchParams.get('path') ?? '';
  if (!path || path.includes('..')) return NextResponse.json({ error: 'path non valido' }, { status: 400 });

  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'token non valido' }, { status: 404 });
  if (!path.startsWith(`rapportini/${rap.id}/`)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(path, 600);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'foto non trovata' }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}

/**
 * POST /api/r/[token]/foto-campo
 * Riceve multipart/form-data con { file: File }.
 * Valida il token, carica la foto su storage (bucket interventi-foto, path rapportini/…),
 * restituisce il path. Il client salva il path in risposte via il normale flusso /voce.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Validazione token
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();

  if (!rap) return NextResponse.json({ error: 'token non valido' }, { status: 404 });
  // Solo 'scaduto' è bloccato: un rapportino 'inviato' deve poter ancora ricevere
  // le foto rimaste in coda sul telefono (lo storage non altera le risposte; il
  // gate d'integrità è su /voce).
  if (
    tokenStatus(
      rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null },
      new Date().toISOString(),
    ) === 'scaduto'
  )
    return NextResponse.json({ error: 'rapportino non modificabile' }, { status: 409 });

  // Parse multipart
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart non valido' }, { status: 400 });
  }

  const file = fd.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file mancante' }, { status: 400 });
  if (!file.type.startsWith('image/'))
    return NextResponse.json({ error: "il file deve essere un'immagine" }, { status: 400 });

  // Upload su storage
  const ext = file.type === 'image/jpeg' ? 'jpg' : (file.type.split('/')[1] ?? 'bin');
  const clientKey = typeof fd.get('clientKey') === 'string' ? (fd.get('clientKey') as string) : undefined;
  const storagePath = nomeFileFoto(rap.id, clientKey, ext);
  const bytes = await file.arrayBuffer();

  const { error: upErr } = await supabaseAdmin.storage
    .from('interventi-foto')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ path: storagePath });
}
