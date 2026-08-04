import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { PROFILO_COMMESSA, parseFamiglia } from '@/lib/acea/famiglia';
import { attoreDa, registraAzione } from '@/lib/audit/registra';

export const runtime = 'nodejs';

/**
 * POST /api/acea/ordini/top — segna (o toglie) il TOP su un blocco di righe.
 *
 * Corpo: `{ chiavi: ['odl|numero_operazione', …], top: boolean }`. La chiave è la stessa di
 * `/api/acea/celle`: il registro ha chiave composta, e le due rotte devono parlare la stessa
 * lingua o l'ufficio si trova due formati per lo stesso gesto.
 *
 * Lo STATO e la pianificazione non si toccano: il TOP è una proprietà dell'ORDINE — come lo
 * vuole ACEA — non dell'uscita che ci mandiamo noi.
 *
 * Stessa platea del resto della scrittura d'ufficio sul registro: `requireAdmin`.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const corpo = (await req.json().catch(() => ({}))) as {
      chiavi?: unknown; top?: unknown; famiglia?: unknown;
    };
    const chiavi = (Array.isArray(corpo.chiavi) ? corpo.chiavi : [])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.includes('|'));
    if (chiavi.length === 0) {
      return NextResponse.json({ error: 'Nessun ordine selezionato.' }, { status: 400 });
    }
    const top = corpo.top === true;
    const profilo = PROFILO_COMMESSA[parseFamiglia(corpo.famiglia)];

    // Una UPDATE per riga: la chiave è composta e PostgREST non sa esprimere un `in` su coppie.
    // Sono decine di righe per gesto, non migliaia — la stessa scelta fatta in `/api/acea/celle`.
    let aggiornati = 0;
    for (const chiave of chiavi) {
      const [odl, operazione] = chiave.split('|');
      const { data, error } = await supabaseAdmin
        .from(profilo.tabellaOrdini)
        .update({ top })
        .eq('odl', odl)
        .eq('numero_operazione', operazione)
        .select('odl');
      if (error) throw error;
      aggiornati += (data ?? []).length;
    }

    /*
      L'audit non è decorazione: «chi ha messo TOP su questo ordine?» è la domanda che arriva
      giorni dopo. `registraAzione` ingoia i suoi errori — un log rotto non deve far fallire la
      marcatura, che è il lavoro vero.
    */
    await registraAzione({
      azione: 'ordine.top',
      attore: attoreDa(auth.user),
      entita: profilo.tabellaOrdini,
      esito: 'ok',
      statoHttp: 200,
      dettaglio: { top, n: aggiornati, odl: chiavi.map((c) => c.split('|')[0]) },
      req,
    });

    return NextResponse.json({ ok: true, aggiornati, top });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore marcatura TOP.' },
      { status: 500 },
    );
  }
}
