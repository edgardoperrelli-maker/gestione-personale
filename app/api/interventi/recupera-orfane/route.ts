import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { risincronizzaGiorno } from '@/lib/interventi/risincronizzaGiorno';
import { giorniDaRecuperare, MAX_GIORNI_RECUPERO } from '@/lib/interventi/giorniDaRecuperare';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/interventi/recupera-orfane  (admin)
 *
 * Recupera le voci di rapportino ESITATE rimaste senza intervento, su TUTTO lo storico.
 *
 * Perché serve una rotta a parte, e non basta il bottone del Live: il modulo Live naviga solo
 * [oggi−7, oggi] (`clampDataLive`), quindi il suo «risincronizza» non può nemmeno vedere i
 * giorni dove le orfane si sono accumulate — al 17/08/2026, 41 delle 42 voci esitate senza
 * intervento stavano prima di quella finestra, la più vecchia il 04/06.
 *
 * Non prende un intervallo da indovinare: si CERCA i giorni che hanno davvero delle orfane. È
 * auto-limitante (finiti i giorni non c'è più niente da fare) e idempotente per costruzione —
 * dopo la passata quei giorni non hanno più orfane, quindi la seconda esecuzione non li trova.
 *
 * Due passi per giorno, nell'ordine che conta:
 *  1. `ensureInterventiForPiano` ricostruisce gli interventi dai TASK del piano, che sono la
 *     fonte di verità e non vengono toccati — preserva completati e annullati. È il motivo per
 *     cui non serve fabbricare nulla: al 17/08 tutte e 42 le orfane avevano ancora il proprio
 *     task nel piano.
 *  2. `risincronizzaGiorno` aggancia le voci agli interventi (ri)nati e riapplica l'esito.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const giorni = await giorniDaRecuperare(supabaseAdmin);
    const dettaglio: Array<{
      data: string; piani: number; creati: number; preservati: number;
      agganciate: number; completati: number;
    }> = [];
    let creatiTot = 0;
    let agganciateTot = 0;
    let completatiTot = 0;

    for (const data of giorni) {
      const { data: piani } = await supabaseAdmin.from('mappa_piani').select('id').eq('data', data);
      let creati = 0;
      let preservati = 0;
      for (const p of (piani ?? []) as Array<{ id: string }>) {
        const r = await ensureInterventiForPiano(supabaseAdmin, p.id);
        creati += r.creati;
        preservati += r.preservati;
      }
      const sync = await risincronizzaGiorno(supabaseAdmin, data);
      creatiTot += creati;
      agganciateTot += sync.agganciate;
      completatiTot += sync.completati;
      dettaglio.push({
        data, piani: (piani ?? []).length, creati, preservati,
        agganciate: sync.agganciate, completati: sync.completati,
      });
    }

    return NextResponse.json({
      ok: true,
      giorni: giorni.length,
      // Vero quando i giorni con orfane erano più del tetto: si rilancia per continuare.
      troncato: giorni.length >= MAX_GIORNI_RECUPERO,
      creati: creatiTot,
      agganciate: agganciateTot,
      completati: completatiTot,
      dettaglio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore recupero.' }, { status: 500 });
  }
}
