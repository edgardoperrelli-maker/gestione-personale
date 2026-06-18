// app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts
// Anteprime foto di una voce (signed URL). Lettura: utente autenticato del modulo.
// Le foto possono stare in 3 fonti (come l'export-zip): risposte voce (campi tipo='foto'),
// interventi_manuali_foto (voci manuali, via richiesta_id) e righe-misuratore (risanamento).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { estraiFotoPaths } from '@/lib/interventi/storico/modifica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

const TTL = 60 * 10; // 10 minuti

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

  // Dedup per path + signed URL (10 min).
  const seen = new Set<string>();
  const foto: Array<{ etichetta: string; fileName: string; url: string }> = [];
  for (const { etichetta, path } of sorgenti) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(path, TTL);
    if (signed?.signedUrl) {
      foto.push({ etichetta, fileName: path.split('/').pop() ?? path, url: signed.signedUrl });
    }
  }
  return NextResponse.json({ foto });
}
