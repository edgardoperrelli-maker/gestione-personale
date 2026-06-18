import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { partiFotoRicevute, etichettaSlotFoto } from '@/lib/interventi/manuali/fotoRicevute';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

const TTL = 60 * 10; // 10 minuti

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: foto, error } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('id, slot_etichetta, storage_path, file_name')
    .eq('richiesta_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: Array<{ id: string; etichetta: string; fileName: string; url: string | null; fileMancante: boolean }> = [];
  for (const f of (foto ?? []) as Array<{ id: string; slot_etichetta: string; storage_path: string; file_name: string }>) {
    const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(f.storage_path, TTL);
    const url = signed?.signedUrl ?? null;
    // url null = la signed URL fallisce perche' l'oggetto non esiste nel bucket (foto persa in invio).
    out.push({ id: f.id, etichetta: f.slot_etichetta, fileName: f.file_name, url, fileMancante: !url });
  }
  return NextResponse.json({ foto: out });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, committente, template_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const form = await req.formData();
  const received = partiFotoRicevute(form);
  if (received.length === 0) return NextResponse.json({ error: 'nessuna_foto' }, { status: 400 });
  for (const { file } of received) {
    if (!file.type.startsWith('image/'))
      return NextResponse.json({ error: 'tipo_file_non_valido' }, { status: 400 });
  }

  // Etichette slot dal template della richiesta (fallback alla chiave).
  let campi: TemplateCampo[] = [];
  if (richiesta.template_id) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template').select('campi').eq('id', richiesta.template_id).maybeSingle();
    campi = ((tpl?.campi ?? []) as TemplateCampo[]);
  }

  for (const { chiave, file } of received) {
    // Sostituzione per-slot: rimuovi le foto esistenti di questo slot.
    const { data: esistenti } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .select('storage_path')
      .eq('richiesta_id', id)
      .eq('slot_chiave', chiave);
    const oldPaths = ((esistenti ?? []) as Array<{ storage_path: string }>).map((r) => r.storage_path);
    if (oldPaths.length > 0) {
      await supabaseAdmin.storage.from('interventi-foto').remove(oldPaths);
      await supabaseAdmin.from('interventi_manuali_foto').delete().eq('richiesta_id', id).eq('slot_chiave', chiave);
    }

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${id}/${chiave}_${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .upload(storagePath, buf, { contentType: file.type || 'image/jpeg', upsert: true });
    if (upErr) return NextResponse.json({ error: 'upload_foto_fallito' }, { status: 502 });

    const { error: insErr } = await supabaseAdmin.from('interventi_manuali_foto').insert({
      richiesta_id: id,
      slot_chiave: chiave,
      slot_etichetta: etichettaSlotFoto(chiave, campi),
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || 'image/jpeg',
      size: file.size,
    });
    if (insErr) {
      await supabaseAdmin.storage.from('interventi-foto').remove([storagePath]);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: received.length });
}
