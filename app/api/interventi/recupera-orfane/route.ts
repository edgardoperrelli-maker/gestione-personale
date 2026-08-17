import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { risincronizzaGiorno } from '@/lib/interventi/risincronizzaGiorno';
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
 * FA SOLO LA META` SICURA, e non e` una limitazione da togliere.
 *
 * Riagganciare una voce a un intervento che esiste e` reversibile e non inventa niente. RICREARE
 * gli interventi mancanti no: l'unico strumento che lo sa fare (`ensureInterventiForPiano`)
 * lavora sul PIANO INTERO — ripristina tutti i task, non i pochi che servono. Lanciato in
 * automatico su 15 giornate il 17/08/2026 ha creato 445 interventi per recuperarne 210: 235
 * erano lavoro pianificato e mai rendicontato, ricomparso come «assegnato» su giornate di
 * giugno. Rimossi con la migration di rollback.
 *
 * Quella meta` resta una decisione per-giornata, col bottone «Rigenera interventi» del Live, che
 * dichiara cosa fa. Qui la si MISURA e basta: `daRigenerare` dice, giorno per giorno, quante
 * orfane si recupererebbero e quanti interventi in piu` comparirebbero — cosi` la scelta si fa
 * sapendo il prezzo.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const giorni = await giorniDaRecuperare(supabaseAdmin);
    const dettaglio: Array<{ data: string; agganciate: number; completati: number; restano: number }> = [];
    let agganciateTot = 0;
    let completatiTot = 0;

    for (const data of giorni) {
      // `soloOrfane`: quelle giornate hanno migliaia di voci in totale e poche decine scollegate.
      // Scorrerle tutte e` cio` che ha fatto scadere la prima versione.
      const sync = await risincronizzaGiorno(supabaseAdmin, data, { soloOrfane: true });
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
      // Le giornate dove resta qualcosa: lì servirebbe «Rigenera interventi», che ripristina il
      // piano intero. La scelta è dell'ufficio, giornata per giornata.
      daRigenerare: dettaglio.filter((d) => d.restano > 0).map((d) => ({ data: d.data, restano: d.restano })),
      dettaglio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore recupero.' }, { status: 500 });
  }
}
