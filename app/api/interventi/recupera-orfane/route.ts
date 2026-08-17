import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { risincronizzaGiorno } from '@/lib/interventi/risincronizzaGiorno';
import { ricostruisciOrfaniDelGiorno } from '@/lib/interventi/ricostruisciOrfani';
import { giorniDaRecuperare, MAX_GIORNI_RECUPERO } from '@/lib/interventi/giorniDaRecuperare';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/interventi/recupera-orfane  (admin)
 *
 * Riaggancia le voci ESITATE rimaste senza intervento, su TUTTO lo storico, e riapplica il loro
 * esito. Il modulo Live naviga solo [oggi−7, oggi] (`clampDataLive`), quindi il suo bottone non
 * può nemmeno vedere i giorni dove le orfane si accumulano: al 17/08/2026 la più vecchia era del
 * 04/06. Non prende un intervallo da indovinare — si cerca i giorni che ne hanno davvero.
 *
 * Due passi, e nessuno dei due rigenera i piani:
 *  1. le orfane il cui intervento ESISTE ancora si riagganciano (`risincronizzaGiorno`);
 *  2. quelle il cui intervento non esiste piu` lo riottengono dal PROPRIO task
 *     (`ricostruisciOrfaniDelGiorno`), uno per uno.
 *
 * Il passo 2 non usa `ensureInterventiForPiano` di proposito: quella e` il ripristino del PIANO
 * INTERO, giusta per il bottone «Rigenera interventi» che si preme su una giornata sapendo cosa
 * comporta, sproporzionata qui. Lanciata in automatico su 15 giornate il 17/08/2026 ha creato
 * 445 interventi per recuperarne 210: i 235 di troppo erano lavoro pianificato e mai
 * rendicontato, ricomparso come «assegnato» su giornate di giugno (rimossi col rollback).
 * Partendo dalla VOCE invece che dal piano, collaterale non ce n'e`.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const giorni = await giorniDaRecuperare(supabaseAdmin);
    const dettaglio: Array<{ data: string; agganciate: number; completati: number; restano: number }> = [];
    let agganciateTot = 0;
    let completatiTot = 0;
    let ricostruitiTot = 0;
    let senzaTaskTot = 0;

    for (const data of giorni) {
      // 1) Le orfane il cui intervento ESISTE ancora: basta riagganciarle.
      //    `soloOrfane`: quelle giornate hanno migliaia di voci in totale e poche decine
      //    scollegate. Scorrerle tutte e` cio` che ha fatto scadere la prima versione.
      const sync = await risincronizzaGiorno(supabaseAdmin, data, { soloOrfane: true });
      // 2) Quelle il cui intervento NON esiste piu`: si ricrea il SUO, dal SUO task — una per
      //    una, senza rigenerare il piano (vedi `ricostruisciOrfani.ts` per il perche`).
      const ric = await ricostruisciOrfaniDelGiorno(supabaseAdmin, data);
      ricostruitiTot += ric.ricostruiti;
      senzaTaskTot += ric.senzaTask;
      agganciateTot += sync.agganciate;
      completatiTot += sync.completati;

      const { count } = await supabaseAdmin
        .from('rapportino_voci')
        .select('id, rapportini!inner(data)', { count: 'exact', head: true })
        .is('intervento_id', null)
        .eq('rapportini.data', data);
      dettaglio.push({ data, agganciate: sync.agganciate, completati: sync.completati, restano: count ?? 0 });
    }

    return NextResponse.json({
      ok: true,
      giorni: giorni.length,
      troncato: giorni.length >= MAX_GIORNI_RECUPERO,
      agganciate: agganciateTot,
      completati: completatiTot,
      ricostruiti: ricostruitiTot,
      // Voci che restano scollegate perche' il loro task non e' piu' nel piano (o l'ODL non lo
      // individua senza ambiguita'): la` non c'e' niente da cui ricostruire, e non si inventa.
      senzaTask: senzaTaskTot,
      // Le giornate dove resta qualcosa: lì servirebbe «Rigenera interventi», che ripristina il
      // piano intero. La scelta è dell'ufficio, giornata per giornata.
      daRigenerare: dettaglio.filter((d) => d.restano > 0).map((d) => ({ data: d.data, restano: d.restano })),
      dettaglio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore recupero.' }, { status: 500 });
  }
}
