import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { nomeFileFoto } from '@/app/api/r/[token]/foto-campo/idempotenza';

export const runtime = 'nodejs';

/**
 * GET /api/admin/consuntivazione/foto?path=rapportini/<rapId>/<file>
 * URL firmato (redirect) per visualizzare una foto caricata dalla consuntivazione.
 * Guardia admin + prefisso rapportini/ (stessa convenzione del flusso operatore).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const path = new URL(req.url).searchParams.get('path') ?? '';
  if (!path || path.includes('..') || !path.startsWith('rapportini/'))
    return NextResponse.json({ error: 'path non valido' }, { status: 400 });
  const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(path, 600);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'foto non trovata' }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}

/**
 * POST /api/admin/consuntivazione/foto — multipart { file, rapId, clientKey }.
 * Carica la foto su interventi-foto sotto rapportini/<rapId>/ (identico al flusso operatore,
 * così i visualizzatori a valle — Storico, ZIP foto — la ritrovano) e restituisce il path.
 * `rapId` è l'id del rapportino contenitore: generato dal client per il "Nuovo ordine" (usato
 * anche come PK del rapportino al salvataggio) o il rapportino esistente per "Ordine presente".
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart non valido' }, { status: 400 });
  }
  const file = fd.get('file');
  const rapId = typeof fd.get('rapId') === 'string' ? (fd.get('rapId') as string) : '';
  if (!(file instanceof File)) return NextResponse.json({ error: 'file mancante' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: "il file deve essere un'immagine" }, { status: 400 });
  if (!/^[0-9a-fA-F-]{10,}$/.test(rapId)) return NextResponse.json({ error: 'rapId non valido' }, { status: 400 });

  const ext = file.type === 'image/jpeg' ? 'jpg' : (file.type.split('/')[1] ?? 'bin');
  const clientKey = typeof fd.get('clientKey') === 'string' ? (fd.get('clientKey') as string) : undefined;
  const storagePath = nomeFileFoto(rapId, clientKey, ext);
  const bytes = await file.arrayBuffer();
  const { error: upErr } = await supabaseAdmin.storage
    .from('interventi-foto')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ path: storagePath });
}
