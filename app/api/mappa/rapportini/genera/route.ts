import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { sincronizzaRapportini } from '@/lib/interventi/sincronizzaRapportini';
import { risolviTerritorioIdPerPiano } from '@/lib/interventi/territorioOverride';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { pianoId, templateId, overwrite, overwriteSubmitted, confermaInviati } = await req.json() as {
      pianoId?: string; templateId?: string; overwrite?: 'replace' | 'skip'; overwriteSubmitted?: boolean; confermaInviati?: boolean;
    };
    // templateId opzionale: senza, il motore risolve da sé il fallback del piano
    // (rapportini esistenti → risanamento → default → primo attivo). Vedi sincronizzaRapportini.
    if (!pianoId) return NextResponse.json({ error: 'pianoId obbligatorio' }, { status: 400 });

    // Guardrail territorio (import Mappa): senza un territorio del piano che risolve a un
    // `territories.id`, la generazione creerebbe interventi senza territorio → invisibili ai filtri
    // per territorio dello storico. Blocca con messaggio chiaro invece di produrre righe orfane.
    const territorioId = await risolviTerritorioIdPerPiano(supabaseAdmin, pianoId);
    if (!territorioId) {
      return NextResponse.json(
        { error: 'Assegna un territorio valido al piano prima di generare i rapportini.' },
        { status: 422 },
      );
    }

    const res = await sincronizzaRapportini(supabaseAdmin, pianoId, { templateId, overwrite, overwriteSubmitted, confermaInviati });
    if (!res.ok) {
      const body: Record<string, unknown> = {};
      if (res.error) body.error = res.error;
      if (res.conflicts) body.conflicts = res.conflicts;
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json({ ok: true, rapportini: res.rapportini, interventiWarning: res.interventiWarning, odlBloccati: res.odlBloccati, odlBloccatiDettagli: res.odlBloccatiDettagli });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore generazione rapportini.' }, { status: 500 });
  }
}
