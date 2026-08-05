// La riconciliazione del registro AcquaLatina: dai NOSTRI rapportini allo stato delle righe.
//
// ACEA chiude gli ordini con l'export del Cruscotto; AcquaLatina non ci rimanda niente, quindi
// la chiusura la scrive il nostro motore: un intervento della commessa `completato` porta lo
// stato sulla sua riga di registro via `ordine_id`. Le regole PURE (chi chiude, chi riapre,
// chi si aggancia, chi si ripulisce) stanno in `chiusuraRegistro.ts`; qui c'è solo la loro
// applicazione al DB, nell'ordine che le fa comporre:
//
//   1. scansione unica del registro (identità, chiuse positive, «non eseguite»);
//   2. interventi conclusi agganciati — AZZERANDO i puntatori pendenti (una riga cancellata
//      dalle fusioni lascia `ordine_id` orfano: senza questo passo l'intervento è invisibile
//      per sempre, perché l'aggancio ripara solo i NULL);
//   3. aggancio per ODL degli interventi senza collegamento (aperti compresi: senza il filo
//      le correzioni anagrafiche del sync non li raggiungono);
//   4. riapertura delle chiuse positive senza più un positivo dietro, e ritorno ad «Aperta»
//      delle «non eseguite» senza più NESSUN concluso dietro;
//   5. i gruppi di chiusura, con la data di completamento che segue l'ultima uscita positiva
//      anche quando l'ufficio la sposta DOPO la chiusura.
//
// Viveva dentro /api/acea/ordini — la tabella è il momento in cui la chiusura si guarda — ma
// il confronto esiti col sito legge lo stesso registro da un'altra porta. Ora gira su
// ENTRAMBE le strade di lettura, con lo stesso throttle.
//
// Throttling a un minuto e best-effort, per processo: una riconciliazione in ritardo di un
// giro è un dato vecchio di un minuto, una che blocca la lettura è il registro rotto.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  PATCH_RIAPERTA, agganciPerOdl, gruppiChiusura, idsDaRiaprire, idsSenzaConcluso,
  patchAggancioAnagrafica,
  type InterventoConcluso, type InterventoSciolto, type RigaPerAggancio,
} from './chiusuraRegistro';

const PAGINA_SCAN = 1000;
const TTL_RICONCILIAZIONE_MS = 60_000;
let riconciliazioneAcquaAt = 0;

export async function riconciliaChiusureAcqualatina(): Promise<void> {
  const ora = Date.now();
  if (ora - riconciliazioneAcquaAt < TTL_RICONCILIAZIONE_MS) return;
  riconciliazioneAcquaAt = ora;

  // 1) Il registro, UNA volta: identità per l'aggancio e la validazione dei puntatori,
  //    chiuse positive per la riapertura, «non eseguite» per la pulizia — e l'anagrafica
  //    (impianto…matricola) per il primo scatto del passo 3.
  const righeRegistro: Array<RigaPerAggancio & { aperto: boolean; esito_positivo: boolean | null }> = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('acqualatina_ordini')
      .select('id, odl, matricola_norm, aperto, esito_positivo, impianto, nominativo, recapito, via, civico, comune, cap, matricola')
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as typeof righeRegistro;
    righeRegistro.push(...blocco);
    if (blocco.length < PAGINA_SCAN) break;
  }
  const idsRegistro = new Set(righeRegistro.map((r) => r.id));
  const chiusePositive = righeRegistro
    .filter((r) => !r.aperto && r.esito_positivo === true).map((r) => r.id);
  // TUTTE le non eseguite, aperte («Aperta — non eseguita») E chiuse («Chiusa — non
  // eseguita», il NO definitivo): se l'uscita che le ha marcate sparisce dal modulo
  // interventi, entrambe tornano «Aperta».
  const nonEseguite = righeRegistro
    .filter((r) => r.esito_positivo === false).map((r) => r.id);

  // 2) I conclusi agganciati. Un `ordine_id` che non esiste più a registro (riga cancellata
  //    da una fusione) si AZZERA subito: l'intervento torna «sciolto» e il passo 3 lo
  //    riaggancia alla riga giusta in questo stesso giro — senza, ogni suo update sarebbe un
  //    no-op silenzioso e la riga superstite resterebbe aperta per sempre.
  let completati: Array<InterventoConcluso & { id: string }> = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, ordine_id, data, esito')
      .eq('committente', 'acqualatina')
      .eq('stato', 'completato')
      .not('ordine_id', 'is', null)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Array<InterventoConcluso & { id: string }>;
    completati.push(...blocco);
    if (blocco.length < PAGINA_SCAN) break;
  }
  const pendenti = completati.filter((c) => c.ordine_id && !idsRegistro.has(c.ordine_id));
  for (let i = 0; i < pendenti.length; i += 200) {
    const { error } = await supabaseAdmin
      .from('interventi')
      .update({ ordine_id: null })
      .in('id', pendenti.slice(i, i + 200).map((p) => p.id));
    if (error) throw error;
  }
  if (pendenti.length > 0) {
    const idsPendenti = new Set(pendenti.map((p) => p.id));
    completati = completati.filter((c) => !idsPendenti.has(c.id));
  }

  /*
    3) L'AGGANCIO che si ripara da solo. Non tutti gli interventi nascono dalla pianificazione
    che scrive `ordine_id`: quelli del vecchio percorso su file sono nati senza — 77 il 04/08,
    con le loro righe di registro ferme su «Aperta» e il confronto col sito a segnalarle.
    Anche gli APERTI si agganciano, non solo i completati: senza il filo le correzioni
    anagrafiche del sync non li raggiungono. Solo l'annullato resta fuori. La regola (per ODL,
    solo a scelta obbligata) sta in `agganciPerOdl`; i riparati CONCLUSI entrano subito fra i
    completati, così la stessa passata chiude le loro righe. Idempotente: un intervento
    agganciato non è più sciolto, al giro dopo non compare.
  */
  const sciolti: InterventoSciolto[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, matricola_contatore, data, esito, stato, pdr, nominativo, recapito, indirizzo, comune, cap')
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
    const agganci = agganciPerOdl(sciolti, righeRegistro);
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
          completati.push({ id: s.id, ordine_id: ordineId, data: s.data, esito: s.esito });
        }
      }
    }

    /*
      Il PRIMO SCATTO anagrafico: senza `ordine_id` questi interventi non hanno mai potuto
      ricevere PDR/impianto, nominativo, recapito, indirizzo, comune, cap o la matricola del
      registro — è il buco che il sync (`ordini/sync/route.ts`) non copre, perché lì la
      propagazione parte da una CORREZIONE rilevata in quel giro, non da «riempi ciò che
      manca». Qui si riempie, riga per riga (i pattern possono differire: ognuno ha già i
      suoi campi propri), e un errore su una riga (es. `matricola_contatore` che collide con
      l'indice di dedup) non deve bloccare l'aggancio delle altre — l'`ordine_id` sopra è già
      scritto ed è la parte che conta di più.
    */
    const registroPerId = new Map(righeRegistro.map((r) => [r.id, r]));
    for (const a of agganci) {
      const s = scioltoPerId.get(a.interventoId);
      const r = registroPerId.get(a.ordineId);
      if (!s || !r) continue;
      const patch = patchAggancioAnagrafica(r, s);
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabaseAdmin.from('interventi').update(patch).eq('id', a.interventoId);
      if (error) console.error('[riconcilia acqualatina] anagrafica non scritta per', a.interventoId, error);
    }
  }

  /*
    4) L'esito SCRITTO NELLA VOCE, per tutti i conclusi (anche quelli appena agganciati).

    `interventi.esito` distingue solo il positivo da tutto il resto: NO e NESSUN PASSAGGIO
    gli arrivano identici, e la regola della commessa vive proprio in quella differenza — il
    NO è definitivo e CHIUDE (dal taglio `NO_CHIUDE_DAL`), il «nessun passaggio» è un giro
    che non c'è stato. La risposta vera sta in `rapportino_voci.risposte.eseguito`.

    Best-effort: se la lettura salta si resta alla regola vecchia (chiude solo il positivo)
    invece di far fallire la riconciliazione. Una riga chiusa in ritardo si recupera al giro
    dopo, una tabella che non si apre no.
  */
  const eseguitoPerIntervento = new Map<string, string>();
  try {
    const idInterventi = completati.map((c) => c.id);
    for (let i = 0; i < idInterventi.length; i += 200) {
      const { data, error } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', idInterventi.slice(i, i + 200));
      if (error) throw error;
      for (const v of (data ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>) {
        if (!v.intervento_id || eseguitoPerIntervento.has(v.intervento_id)) continue;
        const risposta = String((v.risposte ?? {})['eseguito'] ?? '').trim();
        if (risposta !== '') eseguitoPerIntervento.set(v.intervento_id, risposta);
      }
    }
  } catch (e) {
    console.error('[riconcilia acqualatina] esiti delle voci non letti, chiusura sul solo positivo:', e);
  }
  const conEsito = completati.map((c) => ({ ...c, eseguito: eseguitoPerIntervento.get(c.id) ?? null }));

  /*
    5) PRIMA dei gruppi, le due pulizie simmetriche.

    Le chiuse positive rimaste senza il loro intervento positivo si RIAPRONO — è l'esito
    corretto in consuntivazione dopo la chiusura (04/08/2026), l'unico caso in cui «il
    positivo è definitivo» mentiva. Regola in `idsDaRiaprire`; l'ordine sta qui: riaperta la
    riga, l'eventuale uscita superstite la rimarca subito nel giro dei gruppi qui sotto.

    E le «non eseguita» — aperta o chiusa dal NO — rimaste senza NESSUN concluso dietro
    (l'uscita azzerata o cancellata dal modulo interventi) tornano «Aperta»: l'imbuto «da
    ripassare» non deve tenere in coda righe mai davvero visitate. Regola in
    `idsSenzaConcluso`.

    Entrambe idempotenti per costruzione: una riga sistemata non ricompare al giro dopo.
  */
  const daRiaprire = idsDaRiaprire(chiusePositive, conEsito);
  const daRipulire = idsSenzaConcluso(nonEseguite, conEsito);
  for (const ids of [daRiaprire, daRipulire]) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .update(PATCH_RIAPERTA)
        .in('id', ids.slice(i, i + 200));
      if (error) throw error;
    }
  }

  for (const g of gruppiChiusura(conEsito)) {
    for (let i = 0; i < g.ids.length; i += 200) {
      const blocco = g.ids.slice(i, i + 200);
      /*
        UNA guardia sola: non contraddire il positivo, che è definitivo.

        Le righe non positive si riscrivono a ogni riconciliazione con gli stessi valori — è
        un'update a vuoto su poche righe al minuto, e vale il prezzo di far vincere sempre
        l'ultima uscita (NO che diventa «nessun passaggio» e viceversa si correggono da soli)
        invece di dover indovinare quali righe hanno già lo stato giusto.
      */
      const { error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .update(g.patch)
        .in('id', blocco)
        .not('esito_positivo', 'is', true);
      if (error) throw error;

      // La DATA di chiusura segue l'ultima uscita positiva anche sulle righe GIÀ chiuse:
      // l'ufficio può spostare la giornata di un intervento dopo la chiusura, e la guardia
      // qui sopra — giusta per lo stato — terrebbe «Chiusa il» sulla data vecchia. Solo il
      // campo data, solo dove differisce: al giro dopo è un no-op.
      if (g.esito === 'positivo' && g.patch.data_completamento) {
        const { error: eData } = await supabaseAdmin
          .from('acqualatina_ordini')
          .update({ data_completamento: g.patch.data_completamento })
          .in('id', blocco)
          .eq('esito_positivo', true)
          .neq('data_completamento', g.patch.data_completamento);
        if (eData) throw eData;
      }
    }
  }
}
