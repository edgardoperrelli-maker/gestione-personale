import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  paginaCensimento,
  proiezioneCompleta,
  totaleCensimento,
  versioneCensimento,
} from '@/lib/acqualatina/censimentoMaster';

export const runtime = 'nodejs';

/**
 * GET /api/r/[token]/censimento-master — cache offline del censimento AcquaLatina.
 * Stesse tre modalità di /censimento (Acea), con la stessa forma di risposta, così il
 * client di download è uno solo. La fonte qui è il REGISTRO `acqualatina_ordini`: la versione
 * è "<righe>:<ultimo aggiornamento>", perché anche una correzione anagrafica senza righe nuove
 * cambia cosa il campo deve avere in cache.
 *
 *   ?meta=1&v=<versione>     → { unchanged, versione, totale }
 *   ?from=&to=&v=<versione>  → { righe } di UNA pagina (409 se la versione è cambiata)
 *   ?v=<versione>            → { unchanged:true } oppure TUTTE le righe
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Il token deve essere un link operatore reale (non gate sullo stato: è dato di riferimento).
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const versione = await versioneCensimento();

  const qs = new URL(req.url).searchParams;
  const vClient = qs.get('v') ?? '';

  if (qs.get('meta') === '1') {
    return NextResponse.json({
      unchanged: vClient === versione,
      versione,
      totale: await totaleCensimento(),
    });
  }

  const fromRaw = qs.get('from');
  if (fromRaw !== null) {
    // Un import atterrato a metà scaricamento renderebbe le pagine di due dataset diversi.
    if (vClient !== versione) {
      return NextResponse.json({ error: 'versione_cambiata', versione }, { status: 409 });
    }
    const from = Math.max(0, Number(fromRaw) || 0);
    const to = Math.max(from, Number(qs.get('to')) || from);
    try {
      return NextResponse.json({ versione, righe: await paginaCensimento(from, to) });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore lettura censimento' }, { status: 500 });
    }
  }

  if (vClient === versione) return NextResponse.json({ unchanged: true, versione });

  try {
    return NextResponse.json({ unchanged: false, versione, righe: await proiezioneCompleta() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore lettura censimento' }, { status: 500 });
  }
}
