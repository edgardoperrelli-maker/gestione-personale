import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { nomeFileFoto } from './idempotenza';

export const runtime = 'nodejs';

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
  if (
    tokenStatus(
      rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null },
      new Date().toISOString(),
    ) !== 'valido'
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
