// app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts
// Anteprime foto di una voce (signed URL). Lettura: utente autenticato del modulo.
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
    .select('risposte, rapportino_id')
    .eq('id', voceId)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  const v = voce as { risposte: Record<string, unknown> | null; rapportino_id: string };

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('campi_snapshot')
    .eq('id', v.rapportino_id)
    .maybeSingle();
  const campi = ((rap?.campi_snapshot ?? []) as TemplateCampo[]);

  const paths = estraiFotoPaths(v.risposte, campi);
  const foto: Array<{ etichetta: string; fileName: string; url: string }> = [];
  for (const { etichetta, path } of paths) {
    const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(path, TTL);
    if (signed?.signedUrl) {
      foto.push({ etichetta, fileName: path.split('/').pop() ?? path, url: signed.signedUrl });
    }
  }
  return NextResponse.json({ foto });
}
