import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const TTL = 3600; // 1h: durata del link firmato per l'anteprima foto

/**
 * GET /api/r/[token]/foto?path=...
 * Restituisce un signed URL per visualizzare una foto del rapportino (bucket privato).
 * Il path deve appartenere al rapportino del token (prefisso rapportini/<id>/), così il
 * detentore del link può rivedere SOLO le proprie foto.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path mancante' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'token non valido' }, { status: 404 });

  if (!path.startsWith(`rapportini/${rap.id}/`))
    return NextResponse.json({ error: 'path non consentito' }, { status: 403 });

  const { data: signed, error } = await supabaseAdmin.storage
    .from('interventi-foto')
    .createSignedUrl(path, TTL);
  if (error || !signed?.signedUrl)
    return NextResponse.json({ error: 'foto non trovata' }, { status: 404 });

  return NextResponse.json({ url: signed.signedUrl });
}
