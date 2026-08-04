// La riconciliazione del registro AcquaLatina: dai NOSTRI rapportini allo stato delle righe.
//
// ACEA chiude gli ordini con l'export del Cruscotto; AcquaLatina non ci rimanda niente, quindi
// la chiusura la scrive il nostro motore: un intervento della commessa `completato` porta lo
// stato sulla sua riga di registro via `ordine_id`. Le regole PURE (chi chiude, chi riapre,
// chi si aggancia) stanno in `chiusuraRegistro.ts`; qui c'è solo la loro applicazione al DB.
//
// Viveva dentro /api/acea/ordini — la tabella è il momento in cui la chiusura si guarda — ma
// il confronto esiti col sito legge lo stesso registro da un'altra porta, e un confronto su
// righe non ancora riconciliate accusa «manca il nostro esito» a lavoro già consegnato (i
// «sempre 84» del 04/08). Ora gira su ENTRAMBE le strade di lettura, con lo stesso throttle.
//
// Throttling a un minuto e best-effort, per processo: una riconciliazione in ritardo di un
// giro è un dato vecchio di un minuto, una che blocca la lettura è il registro rotto.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  PATCH_RIAPERTA, agganciPerOdl, gruppiChiusura, idsDaRiaprire,
  type InterventoConcluso, type InterventoSciolto, type RigaPerAggancio,
} from './chiusuraRegistro';

const PAGINA_SCAN = 1000;
const TTL_RICONCILIAZIONE_MS = 60_000;
let riconciliazioneAcquaAt = 0;

export async function riconciliaChiusureAcqualatina(): Promise<void> {
  const ora = Date.now();
  if (ora - riconciliazioneAcquaAt < TTL_RICONCILIAZIONE_MS) return;
  riconciliazioneAcquaAt = ora;

  const completati: InterventoConcluso[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('ordine_id, data, esito')
      .eq('committente', 'acqualatina')
      .eq('stato', 'completato')
      .not('ordine_id', 'is', null)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as InterventoConcluso[];
    completati.push(...blocco);
    if (blocco.length < PAGINA_SCAN) break;
  }

  /*
    L'AGGANCIO che si ripara da solo. Non tutti gli interventi nascono dalla pianificazione
    che scrive `ordine_id`: quelli del vecchio percorso su file sono nati senza, eseguiti sul
    campo e invisibili a questa riconciliazione — 77 il 04/08, con le loro righe di registro
    ferme su «Aperta» e il confronto col sito a segnalarle. La regola dell'aggancio (per ODL,
    solo a scelta obbligata) sta in `agganciPerOdl`; qui si scrive il collegamento e i
    riparati entrano SUBITO fra i completati, così la stessa passata chiude le loro righe.
    Idempotente: un intervento agganciato non è più sciolto, al giro dopo non compare.
  */
  // Anche gli interventi APERTI si agganciano, non solo i completati: senza il filo le
  // correzioni anagrafiche del sync non li raggiungono, e la tabella del registro non li
  // mostra fra Esecutore/Data pianificata. Solo l'annullato resta fuori: non c'è più niente
  // da fargli seguire.
  const sciolti: InterventoSciolto[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, matricola_contatore, data, esito, stato')
      .eq('committente', 'acqualatina')
      .neq('stato', 'annullato')
      .is('ordine_id', null)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as InterventoSciolto[];
    sciolti.push(...blocco);
    if (blocco.length < PAGINA_SCAN) break;
  }
  if (sciolti.length > 0) {
    const righeAggancio: RigaPerAggancio[] = [];
    for (let offset = 0; ; offset += PAGINA_SCAN) {
      const { data, error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .select('id, odl, matricola_norm')
        .range(offset, offset + PAGINA_SCAN - 1);
      if (error) throw error;
      const blocco = (data ?? []) as RigaPerAggancio[];
      righeAggancio.push(...blocco);
      if (blocco.length < PAGINA_SCAN) break;
    }
    const agganci = agganciPerOdl(sciolti, righeAggancio);
    const perOrdine = new Map<string, string[]>();
    for (const a of agganci) {
      perOrdine.set(a.ordineId, [...(perOrdine.get(a.ordineId) ?? []), a.interventoId]);
    }
    const scioltoPerId = new Map(sciolti.map((s) => [s.id, s]));
    for (const [ordineId, interventoIds] of perOrdine) {
      const { error } = await supabaseAdmin
        .from('interventi')
        .update({ ordine_id: ordineId })
        .in('id', interventoIds);
      if (error) throw error;
      for (const id of interventoIds) {
        const s = scioltoPerId.get(id);
        // Solo il CONCLUSO entra nel giro di chiusura: l'aperto appena agganciato non ha
        // ancora un esito da portare al registro.
        if (s && s.stato === 'completato') {
          completati.push({ ordine_id: ordineId, data: s.data, esito: s.esito });
        }
      }
    }
  }

  /*
    PRIMA dei gruppi: le chiuse positive rimaste senza il loro intervento positivo si
    RIAPRONO — è l'esito corretto in consuntivazione dopo la chiusura (04/08/2026), l'unico
    caso in cui «il positivo è definitivo» mentiva. Il perché e la regola («nessun positivo
    superstite», non «l'intervento è cambiato») stanno in `idsDaRiaprire`; l'ordine sta qui:
    riaperta la riga, l'eventuale uscita negativa superstite la rimarca subito «Aperta — non
    eseguita» nel giro dei gruppi qui sotto. Idempotente per costruzione: una riga riaperta
    non è più chiusa positiva, e al giro dopo non compare.
  */
  const chiusePositive: string[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('acqualatina_ordini')
      .select('id')
      .eq('aperto', false)
      .eq('esito_positivo', true)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Array<{ id: string }>;
    chiusePositive.push(...blocco.map((r) => r.id));
    if (blocco.length < PAGINA_SCAN) break;
  }
  const daRiaprire = idsDaRiaprire(chiusePositive, completati);
  for (let i = 0; i < daRiaprire.length; i += 200) {
    const { error } = await supabaseAdmin
      .from('acqualatina_ordini')
      .update(PATCH_RIAPERTA)
      .in('id', daRiaprire.slice(i, i + 200));
    if (error) throw error;
  }

  for (const g of gruppiChiusura(completati)) {
    for (let i = 0; i < g.ids.length; i += 200) {
      const q = supabaseAdmin
        .from('acqualatina_ordini')
        .update(g.patch)
        .in('id', g.ids.slice(i, i + 200));
      /*
        Le due guardie. Servono a due cose insieme: non contraddire il positivo (che è
        definitivo, e nessuna uscita successiva può riaprire) e restare IDEMPOTENTI — questa
        riconciliazione rigira a ogni lettura, e senza guardia riscriverebbe ogni minuto
        righe già a posto.

        Il positivo chiude tutto ciò che non è già chiuso positivo: anche una riga che un'uscita
        negativa aveva lasciato aperta, che è il caso normale del ripasso riuscito.

        Il negativo tocca solo la riga che ha qualcosa da correggere — mai esitata, oppure chiusa
        negativa dalla vecchia regola, che è la riga da riaprire (le 12 del 03/08). Su una riga
        già «aperta e non eseguita» non scrive, e su una chiusa POSITIVA non entra mai.
      */
      const { error } = await (g.positivo
        ? q.not('esito_positivo', 'is', true)
        : q.or('esito_positivo.is.null,and(esito_positivo.is.false,aperto.is.false)'));
      if (error) throw error;
    }
  }
}
