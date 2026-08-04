import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  COLONNE_ELENCO, COLONNE_TESTO,
  leggiFiltri, soglieScadenza, intervalloPagina, espressioneRicerca,
  serveIncrocio, filtriPianificazioneAttivi, ordinamentoDaIncrociare,
  ORDINAMENTI, type FiltriOrdini, type FiltriPianificazione,
} from '@/lib/acea/filtriOrdini';
import { partiRoma } from '@/lib/agente/orarioRoma';
import {
  chiaviAggancio, isAttivitaSaracinesca, saracinescaContemplata, FRAMMENTI_SARACINESCA,
} from '@/lib/acea/saracinesche';
import { odlConSaracinescaDichiarata } from '@/lib/acea/caricaSaracinesche';
import { comuniMassiveAperti } from '@/lib/acea/caricaComuniMassive';
import { contaSenzaData, type InterventoDellOdl } from '@/lib/acea/codaRiaperture';
import { PROFILO_COMMESSA } from '@/lib/acea/famiglia';
import { PATCH_RIAPERTA, gruppiChiusura, idsDaRiaprire, type InterventoConcluso } from '@/lib/acqualatina/chiusuraRegistro';
// La stessa normalizzazione della colonna «Eseguito» del modulo Interventi: una sola regola per
// due schermate che parlano dello stesso lavoro.
import { siNo } from '@/lib/interventi/storico/normalizza';

export const runtime = 'nodejs';

/** I due committenti ACEA: restano cablati nei percorsi SOLO ACEA (riaperture, saracinesche). */
const COMMITTENTI = ['acea', 'lim_massive'];

/**
 * Chiave con cui una riga del registro e i suoi `interventi` si agganciano.
 *
 * Per ACEA è l'ODL (più operazioni dello stesso ordine sono lo stesso passaggio sul posto); per
 * ACQUALATINA è ODL+matricola — un ordine copre fino a cinque contatori, e agganciare per solo
 * ODL mostrerebbe su tutt'e cinque le righe l'esecutore del primo pianificato.
 */
const normMatr = (m: string | null | undefined): string =>
  String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const chiaveAggancioIntervento = (
  famiglia: string | null,
  odl: string,
  matricola?: string | null,
): string => (famiglia === 'acqualatina' ? `${odl}#${normMatr(matricola)}` : odl);

/** Pagina delle scansioni interne (chiavi, interventi): non esce dal server, può essere ampia. */
const PAGINA_SCAN = 1000;

/** Colonne del registro esposte alla tabella. Non `select('*')`: il payload viaggia a ogni pagina. */
const COLONNE = [
  'odl', 'numero_operazione', 'famiglia', 'tipo_ordine', 'attivita', 'denominazione',
  'stato', 'stato_desc', 'aperto',
  'data_creazione', 'cardine_al', 'scadenza', 'data_completamento',
  'operatore_cognome', 'operatore_nome',
  'causale', 'causale_desc', 'esito_positivo',
  'via', 'civico', 'cap', 'comune', 'provincia', 'microarea', 'microarea_stimata',
  'impianto', 'matricola', 'matricola_norm', 'sospetto_troncamento',
  // L'anagrafica dell'utente: piena su acqualatina (dal master del committente), NULL su ACEA,
  // che nel suo export non la manda. Le colonne esistono su entrambe le tabelle proprio perché
  // questa select vale per tutt'e due — vedi la nota in 20260731170000_acqualatina_ordini.sql.
  'nominativo', 'recapito',
  'valore_netto', 'escludi_consuntivazione', 'codice_sla', 'priorita_testo',
  'testo_ordine', 'centro_lavoro', 'note',
  // Il TOP di ACEA. Sta nella select principale e non fra le opzionali perché la colonna esiste
  // su ENTRAMBE le tabelle (migration 20260804110000): la lista è una sola per due registri.
  'top',
  // L'esecutore e la data di ACEA: sono nel registro dall'inizio, ma senza queste due qui non
  // arrivavano in tabella — e le colonne «Esecutore»/«Data pianificata» sono le NOSTRE, quindi
  // su un ordine chiuso da ACEA e mai pianificato da noi restavano vuote. Sembrava un import
  // che non aveva caricato niente.
  'operatore_nome', 'data_completamento',
  /*
    Gli appunti (`pianificato_*_bozza`) NON sono qui, ed è deliberato: si leggono a parte, con la
    stessa degradazione delle saracinesche. Sono colonne di una migration che potrebbe non essere
    ancora passata sul database che sta servendo questo codice, e una colonna sconosciuta in questo
    elenco non fa fallire una decorazione — fa fallire la query del registro, cioè il motivo per
    cui si apre la schermata. È già successo una volta.
  */
].join(', ');

type OrdineRow = Record<string, unknown> & { odl: string; numero_operazione: string };

/**
 * GET /api/acea/ordini — registro filtrato e paginato.
 *
 * Query: famiglia, stato (tutti|aperti|chiusi), scadenza (tutte|scaduti|in_scadenza|senza_scadenza),
 * entroGiorni, cerca, pagina, perPagina, più i filtri di colonna:
 * - a elenco, ripetibili (`comune=ROMA&comune=TIVOLI`): comune, attivita, stato_desc,
 *   operatore_cognome — in OR fra i valori della stessa colonna, in AND fra colonne diverse;
 * - a testo «contiene»: odl, matricola_norm, impianto, via.
 *
 * I filtri di colonna si applicano QUI e non sul client: la tabella carica 300 righe per volta su
 * un registro da 5.000+, quindi filtrare il caricato mostrerebbe un sottoinsieme di un
 * sottoinsieme, con un conteggio che non corrisponde a niente.
 *
 * Ogni riga porta la PIANIFICAZIONE agganciata (esecutore e giorno dagli `interventi`): il
 * registro resta lo specchio immutabile di ACEA, il nostro lavoro vive altrove e si unisce qui
 * in lettura — è il "riporto" che prima l'agente scriveva dentro il file master.
 */
/** La query sul registro con tutti i criteri e l'ordinamento canonico. */
function queryRegistro(selezione: string, f: FiltriOrdini, oggi: string) {
  // La tabella la decide la famiglia: acqualatina ha il SUO registro, con la stessa forma di
  // colonne — è ciò che permette a questa query (e alla select condivisa) di valere su entrambi.
  const profilo = PROFILO_COMMESSA[f.famiglia ?? 'dunning'];
  let q = supabaseAdmin.from(profilo.tabellaOrdini).select(selezione, { count: 'exact' });

  if (f.famiglia) q = q.eq('famiglia', f.famiglia);
  if (f.stato === 'aperti') q = q.eq('aperto', true);
  if (f.stato === 'chiusi') q = q.eq('aperto', false);
  // La scheda-comune della vista massive: un `eq` secco. I valori delle schede escono dal
  // registro stesso (`comuniMassiveAperti`), quindi corrispondono per costruzione — l'import
  // normalizza il comune, verificato in produzione su tutti e cinque i paesi.
  if (f.comuneScheda) q = q.eq('comune', f.comuneScheda);
  // `saracinesche` non restringe qui: e` un sottoinsieme che attraversa aperti e chiusi, e il dato
  // che lo definisce sta in `acea_master_snapshot`. Lo applica il percorso di incrocio.
  //
  // `riaperture` invece e` un sottoinsieme che il registro conosce da se`: `riapertura` e` una
  // colonna generata da `codice_sla`, quindi si filtra qui e non costa un incrocio. Attraversa
  // aperti e chiusi come le saracinesche — chi controlla il lavoro fatto ha bisogno anche di
  // quelle chiuse — ma l'ordinamento della scheda mette le APERTE in cima, che sono le uniche che
  // possono ancora sfuggire.
  // La scheda e` una CODA: solo le aperte su ACEA. Le esitate stanno in «Chiusi», e l'altra meta`
  // del taglio — «non completata nei rapportini» — si fa nell'incrocio, perche` vive in
  // `interventi` e Postgres da qui non la vede.
  if (f.stato === 'riaperture') q = q.eq('riapertura', true).eq('aperto', true);

  // Filtri di colonna. `in` per le spunte (un valore solo resta un `in` di uno: stesso piano di
  // esecuzione di `eq` su Postgres), `ilike` per il «contiene».
  for (const c of COLONNE_ELENCO) {
    const valori = f.elenchi[c];
    if (valori.length > 0) q = q.in(c, valori);
  }
  for (const c of COLONNE_TESTO) {
    const t = f.testi[c];
    if (t) q = q.ilike(c, `*${t}*`);
  }

  const soglie = soglieScadenza(f, oggi);
  if (soglie.tipo === 'scaduti') q = q.lt('scadenza', soglie.prima);
  else if (soglie.tipo === 'in_scadenza') q = q.gte('scadenza', soglie.da).lte('scadenza', soglie.a);
  else if (soglie.tipo === 'senza_scadenza') q = q.is('scadenza', null);

  const ricerca = espressioneRicerca(f);
  if (ricerca) q = q.or(ricerca);

  /*
    L'ordinamento CHIESTO dall'utente viene prima; quello canonico resta sotto come spareggio.

    Deve restare TOTALE (la coppia odl+operazione è unica): senza un criterio che distingue ogni
    riga, due pagine successive potrebbero ripetere o saltare righe, perché Postgres non garantisce
    un ordine stabile fra query diverse a parità di chiave. Su un ordinamento per gruppo — dove
    centinaia di righe condividono lo stesso valore — sarebbe successo di sicuro.
  */
  const scelto = f.ordina === null ? null : ORDINAMENTI[f.ordina];
  if (scelto?.tipo === 'registro') {
    // `nullsFirst: false` sempre: le righe senza valore stanno in fondo in entrambi i versi, che è
    // dove uno se le aspetta. In cima somiglierebbero a un risultato.
    q = q.order(scelto.campo, { ascending: f.verso === 'asc', nullsFirst: false });
    // Gli spareggi della colonna (l'indirizzo: civico numerico, poi testuale), nello stesso verso.
    // La guardia `in` serve al tipo: ogni voce di ORDINAMENTI è il SUO letterale, e `poi` ce
    // l'hanno solo quelle che lo dichiarano.
    const spareggi: readonly string[] = ('poi' in scelto ? scelto.poi : undefined) ?? [];
    for (const campo of spareggi) {
      q = q.order(campo, { ascending: f.verso === 'asc', nullsFirst: false });
    }
  } else if (f.famiglia === 'acqualatina') {
    /*
      Ordinamento canonico della campagna: la STRADA. Si lavora porta a porta, e senza un
      ordinamento chiesto la tabella deve seguire il giro — via, poi civico numerico, poi il
      testo del civico («12/A» prima di «12/B»). Niente riaperture o scadenze in testa: sono
      colonne ACEA, qui vuote per costruzione, e ordinare sul vuoto è ordinare a caso.
    */
    q = q.order('via', { ascending: true, nullsFirst: false })
      .order('civico_num', { ascending: true, nullsFirst: false })
      .order('civico', { ascending: true, nullsFirst: false });
  } else if (f.stato === 'riaperture') {
    // Dentro la scheda sono riaperture tutte quante, e tutte APERTE (le esitate stanno in
    // «Chiusi»): l'unico criterio che serve è l'urgenza — prima chi scade prima.
    q = q.order('scadenza', { ascending: true, nullsFirst: false })
      .order('data_creazione', { ascending: true });
  } else {
    /*
      Le RIAPERTURE in cima — dove ha senso.

      Ordinare per scadenza porta in cima il più VECCHIO, che non è il più urgente: una limitazione
      di maggio è scaduta da due mesi e sta sopra una riapertura nata oggi, che scade domani. Con
      un giorno di cardine contro quattordici, le riaperture finivano alle righe 491-548 di 924 —
      misurato sul registro, non temuto.

      Due limiti, entrambi voluti:

      - sta nel ramo `else`, quindi vale per l'ordinamento PREDEFINITO e sparisce appena si clicca
        un'intestazione. Un ordinamento chiesto dall'utente che tiene comunque righe inchiodate in
        cima non è un ordinamento, è una tabella che mente su cosa sta mostrando;
      - NON si applica ai «Chiusi». Lì le riaperture sono 452 su 466 e nessuna può più sfuggire:
        portarle in cima non segnalerebbe un'urgenza, seppellirebbe le chiusure recenti — cioè
        esattamente quello che si va a cercare in quella scheda.
    */
    if (f.stato !== 'chiusi') q = q.order('riapertura', { ascending: false });
    q = q.order('scadenza', { ascending: true, nullsFirst: false })
      .order('data_creazione', { ascending: true });
  }
  return q.order('odl', { ascending: true }).order('numero_operazione', { ascending: true });
}

type Chiave = {
  odl: string;
  numero_operazione: string;
  attivita: string | null;
  /** Solo acqualatina: entra nella chiave di aggancio con gli interventi. */
  matricola?: string | null;
};

/** Tutte le chiavi che passano i criteri della vista, nell'ordine della tabella. */
async function scansionaChiavi(f: FiltriOrdini, oggi: string): Promise<Chiave[]> {
  const colonne = f.famiglia === 'acqualatina'
    ? 'odl, numero_operazione, attivita, matricola'
    : 'odl, numero_operazione, attivita';
  const chiavi: Chiave[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await queryRegistro(colonne, f, oggi)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as unknown as Chiave[];
    chiavi.push(...blocco);
    if (blocco.length < PAGINA_SCAN) break;
  }
  return chiavi;
}

type VoceIntervento = {
  odl: string | null; data: string | null; staff_id: string | null; stato: string | null;
  esito?: string | null;
  matricola_contatore?: string | null;
  /** Presente solo sulla lettura della pagina: serve ad agganciare la voce di rapportino. */
  id?: string;
};

/**
 * Tutti gli interventi della commessa: chiave di aggancio → chi, quando, e se è finita. Serve al
 * predicato, non al display. `completato` alimenta la coda delle riaperture: esitata è SOLO la
 * riapertura con esito positivo — un'uscita chiusa a vuoto lascia l'ordine da lavorare, e in una
 * coda di lavoro ci sta eccome (è la riga che rischia di sfuggire).
 */
type IndicePianificazione = Map<string, { staff: Set<string>; giorni: Set<string>; completato: boolean }>;

/**
 * L'indice per i SOLI ODL indicati: la versione mirata di `indicePianificazione`.
 *
 * La scansione completa degli interventi (~7.000 righe, sette richieste in fila) serve solo
 * quando il criterio tocca TUTTO il registro — filtri di pianificazione o ordinamento per
 * esecutore/data. La coda delle riaperture no: le sue chiavi le ha già tagliate Postgres a poche
 * decine, e chiederle mirate costa una richiesta invece di sette. Era il grosso della lentezza
 * percepita dopo un salvataggio: ogni ricarica della scheda pagava la scansione intera.
 */
async function indicePianificazionePerOdl(odl: readonly string[]): Promise<IndicePianificazione> {
  const indice: IndicePianificazione = new Map();
  const unici = [...new Set(odl)];
  for (let i = 0; i < unici.length; i += 200) {
    const blocco = unici.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('odl, data, staff_id, stato, esito')
      .in('odl', blocco)
      .in('committente', COMMITTENTI);
    if (error) throw error;
    for (const it of (data ?? []) as VoceIntervento[]) {
      if (!it.odl || it.stato === 'annullato') continue;
      const v = indice.get(it.odl)
        ?? { staff: new Set<string>(), giorni: new Set<string>(), completato: false };
      if (it.staff_id) v.staff.add(it.staff_id);
      if (it.data) v.giorni.add(it.data);
      if (it.esito === 'eseguito_positivo') v.completato = true;
      indice.set(it.odl, v);
    }
  }
  return indice;
}

async function indicePianificazione(f: FiltriOrdini): Promise<IndicePianificazione> {
  const profilo = PROFILO_COMMESSA[f.famiglia ?? 'dunning'];
  const indice: IndicePianificazione = new Map();
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('odl, data, staff_id, stato, esito, matricola_contatore')
      .in('committente', [...profilo.committenti])
      .order('odl', { ascending: true })
      .order('data', { ascending: true })
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as VoceIntervento[];
    for (const it of blocco) {
      if (!it.odl) continue;
      /*
        Un intervento ANNULLATO è lavoro che non è mai successo: non assegna e non pianifica.

        Prima entrava nell'indice come gli altri, e le tre viste sullo stesso ODL si
        contraddicevano: il badge lo contava «senza esecutore» (via `assegnata()`, che gli
        annullati li scarta), ma il filtro «Non assegnato» non lo trovava e la colonna Esecutore
        mostrava il nome di chi NON ci sarebbe andato. Stessa regola di `pianoPianificazione`,
        che gli annullati li ha sempre trattati come inesistenti.
      */
      if (it.stato === 'annullato') continue;
      const chiave = chiaveAggancioIntervento(f.famiglia, it.odl, it.matricola_contatore);
      const v = indice.get(chiave)
        ?? { staff: new Set<string>(), giorni: new Set<string>(), completato: false };
      if (it.staff_id) v.staff.add(it.staff_id);
      if (it.data) v.giorni.add(it.data);
      if (it.esito === 'eseguito_positivo') v.completato = true;
      indice.set(chiave, v);
    }
    if (blocco.length < PAGINA_SCAN) break;
  }
  return indice;
}

/*
  ---- Chiusura AcquaLatina: dai rapportini al registro --------------------------------------

  ACEA chiude gli ordini con l'export del Cruscotto; AcquaLatina non ci rimanda niente, quindi
  la chiusura la scrive il NOSTRO motore: un intervento della commessa `completato` (rapportino
  consegnato con esito) porta lo stato sulla sua riga di registro — per `ordine_id`, che è il
  collegamento che la pianificazione scrive alla creazione, quindi regge anche gli ODL
  multi-matricola.

  CHIUDE solo il positivo: un'uscita negativa lascia la riga aperta, perché il contatore è ancora
  lì da sostituire. La regola sta tutta in `gruppiChiusura`, insieme al perché. E RIAPRE la
  chiusa positiva rimasta senza il suo intervento positivo — l'esito corretto in consuntivazione
  dopo la chiusura (vedi `idsDaRiaprire`): correggere l'intervento basta, il registro segue.

  Gira qui, sulla strada della lettura, e non in un cron: la tabella è il momento in cui la
  chiusura si guarda. Throttling a un minuto e best-effort — una riconciliazione in ritardo di
  un giro è un dato vecchio di un minuto, una che blocca la lettura è il registro rotto.
*/
const TTL_RICONCILIAZIONE_MS = 60_000;
let riconciliazioneAcquaAt = 0;

async function chiudiOrdiniAcqualatinaCompletati(): Promise<void> {
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
        riconciliazione rigira a ogni lettura della tabella, e senza guardia riscriverebbe ogni
        minuto righe già a posto.

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

/**
 * Le attivazioni APERTE senza una data di pianificazione: il triangolo rosso sulla scheda.
 *
 * Viaggia su OGNI risposta della lista — il triangolo deve dire il vero anche da un'altra scheda,
 * ed è lì che serve: chi sta sui «Da lavorare» deve vedere che ci sono attivazioni fuori
 * calendario senza andare a controllare. Hanno un giorno di cardine: quella non messa su un
 * giorno è quella che scade domani e sparisce senza che nessuno la veda. Due query mirate e
 * piccole, non l'incrocio completo: le riaperture aperte sono poche decine (14 sul registro
 * misurato), quindi la `in` sugli ODL resta corta — non è la URL da 33 KB che ha già rotto il
 * registro una volta.
 *
 * Best-effort: se una lettura fallisce il numero non c'è (`null`), la tabella si carica lo
 * stesso. Un contatore è una decorazione, e una decorazione non porta giù la vista.
 */
async function riapertureSenzaData(): Promise<number | null> {
  try {
    const { data: righe, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl')
      .eq('riapertura', true)
      .eq('aperto', true)
      // La stessa famiglia della scheda che il triangolo decora. La colonna `riapertura` deriva
      // dal solo `codice_sla`, e il dominio contempla una massive con codice RIAT
      // (riaperture.test.ts): senza questo filtro il numero conterebbe righe che la scheda non
      // mostra.
      .eq('famiglia', 'dunning');
    if (error) throw error;
    const odl = [...new Set(((righe ?? []) as Array<{ odl: string }>).map((r) => r.odl))];
    if (odl.length === 0) return 0;

    const interventiPerOdl = new Map<string, InterventoDellOdl[]>();
    for (let i = 0; i < odl.length; i += 200) {
      const blocco = odl.slice(i, i + 200);
      const { data: interventi, error: eInt } = await supabaseAdmin
        .from('interventi')
        .select('odl, staff_id, stato, esito')
        .in('odl', blocco)
        .in('committente', COMMITTENTI);
      if (eInt) throw eInt;
      for (const it of (interventi ?? []) as Array<{
        odl: string | null; staff_id: string | null; stato: string | null; esito: string | null;
      }>) {
        if (!it.odl) continue;
        const lista = interventiPerOdl.get(it.odl) ?? [];
        lista.push({ staff_id: it.staff_id, stato: it.stato, esito: it.esito });
        interventiPerOdl.set(it.odl, lista);
      }
    }
    return contaSenzaData(odl, interventiPerOdl);
  } catch (e) {
    console.error('[acea/ordini] attivazioni senza data non contate:', e);
    return null;
  }
}

/** `staff_id` → nome, per ordinare per esecutore con quello che si LEGGE, non con un uuid. */
async function nomiStaff(): Promise<Map<string, string>> {
  const nomi = new Map<string, string>();
  const { data, error } = await supabaseAdmin.from('staff').select('id, display_name');
  if (error) throw error;
  for (const s of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (s.display_name) nomi.set(s.id, s.display_name);
  }
  return nomi;
}

/** L'ordine ACEA di sostituzione che copre un misuratore. */
type Sostituzione = { odl: string; stato: string | null; aperto: boolean };

/**
 * Gli ordini ACEA di SOSTITUZIONE saracinesca, indicizzati per impianto e per matricola.
 *
 * Sono l'ordine vero, quello che ACEA ha generato e che verrà pagato — non la colonna del master
 * compilata a mano. Nel registro sono 267, tutti in famiglia `massive` (sono ASTR): entrano
 * comodamente in memoria, quindi si caricano una volta per richiesta invece di interrogare il
 * registro riga per riga.
 *
 * L'aggancio è per impianto O per matricola, con `chiaviAggancio`: le due parti non sono
 * simmetriche — la sostituzione porta quasi sempre l'impianto, la limitazione spesso solo la
 * matricola — e pretendere che coincidano entrambe perderebbe la maggior parte dei collegamenti.
 */
let cacheSostituzioni: { indice: Map<string, Sostituzione>; quando: number } | null = null;

/**
 * Gli ordini di sostituzione cambiano solo a import: non a ogni pagina della tabella.
 *
 * Come per le dichiarazioni, un minuto di ritardo su questo elenco non cambia nessuna decisione,
 * mentre rifarne la scansione a ogni caricamento si sente tutto.
 */
const TTL_SOSTITUZIONI_MS = 60_000;

async function indiceSostituzioni(): Promise<Map<string, Sostituzione>> {
  const ora = Date.now();
  if (cacheSostituzioni && ora - cacheSostituzioni.quando < TTL_SOSTITUZIONI_MS) {
    return cacheSostituzioni.indice;
  }

  const indice = new Map<string, Sostituzione>();
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl, attivita, impianto, matricola, stato_desc, stato, aperto')
      /*
        Il filtro sull'attivita` lo fa POSTGRES, non il ciclo qui sotto.

        Prima si scaricava tutto il registro — 5.227 righe in sei richieste — per tenerne 267.
        Il predicato TS resta come rete (i frammenti sono gli stessi), ma la selezione grossa la
        fa la banca dati, che ha un indice apposta.
      */
      .or(FRAMMENTI_SARACINESCA.map((k: string) => `attivita.ilike.*${k}*`).join(','))
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Array<{
      odl: string; attivita: string | null; impianto: string | null; matricola: string | null;
      stato_desc: string | null; stato: string | null; aperto: boolean;
    }>;
    for (const o of blocco) {
      if (!isAttivitaSaracinesca(o.attivita)) continue;
      const v: Sostituzione = { odl: o.odl, stato: o.stato_desc ?? o.stato, aperto: o.aperto };
      // Su entrambe le chiavi: chi cerca conosce l'una o l'altra, non per forza tutte e due.
      for (const k of chiaviAggancio({ impianto: o.impianto, matricola: o.matricola })) {
        if (!indice.has(k)) indice.set(k, v);
      }
    }
    if (blocco.length < PAGINA_SCAN) break;
  }
  cacheSostituzioni = { indice, quando: ora };
  return indice;
}

/**
 * Il predicato dei due filtri di pianificazione, per un singolo ODL.
 *
 * Dentro la stessa colonna i criteri sono in OR (le spunte di un AutoFiltro lo sono sempre: gli
 * ordini di ROSSI **oppure** quelli non assegnati); fra colonne diverse sono in AND, come per ogni
 * altra colonna della tabella.
 */
function passaPianificazione(
  chiave: string,
  p: FiltriPianificazione,
  indice: Map<string, { staff: Set<string>; giorni: Set<string> }>,
  staffScelti: Set<string>,
): boolean {
  const v = indice.get(chiave);

  if (p.esecutori.length > 0 || p.senzaEsecutore) {
    const assegnatoAUnoScelto = v ? [...v.staff].some((s) => staffScelti.has(s)) : false;
    const nonAssegnato = !v || v.staff.size === 0;
    if (!(assegnatoAUnoScelto || (p.senzaEsecutore && nonAssegnato))) return false;
  }

  if (p.pianificazione === 'non_pianificati' && v && v.giorni.size > 0) return false;
  if (p.pianificazione === 'pianificati' && (!v || v.giorni.size === 0)) return false;
  if (p.giorno && !v?.giorni.has(p.giorno)) return false;

  return true;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const f = leggiFiltri(searchParams);
    // "oggi" nel fuso di lavoro, non in UTC: alle 01:00 di Roma d'estate UTC è ancora ieri, e
    // un ordine in scadenza oggi risulterebbe scaduto.
    const oggi = partiRoma(new Date()).oggi;
    const { da, a } = intervalloPagina(f);
    const acqua = f.famiglia === 'acqualatina';

    // La chiusura acqualatina si riconcilia PRIMA di leggere: la pagina deve mostrare chiuso
    // ciò che i rapportini hanno chiuso. Throttled e best-effort (vedi la funzione).
    if (acqua) {
      await chiudiOrdiniAcqualatinaCompletati().catch((e) => {
        console.error('[acea/ordini] chiusure acqualatina non riconciliate:', e);
      });
    }

    // Il triangolo parte SUBITO e si riscuote alla fine: è indipendente da tutto il resto, e
    // messo in coda com'era aggiungeva le sue due letture alla latenza di ogni risposta.
    // È un dato di DUNNING (attivazioni fuori calendario): sulle risposte della vista massive non
    // si calcola — il client là non lo disegna, e sarebbero due letture pagate per un numero muto.
    const triangolo = f.famiglia === 'massive' || acqua
      ? Promise.resolve<number | null>(null)
      : riapertureSenzaData();
    /*
      Le schede della vista massive: i comuni con ordini aperti, sull'INTERO registro massive e
      non sulla query corrente — la fila delle schede non deve cambiare a seconda della scheda da
      cui la si guarda. Best-effort come il triangolo: `null` = non calcolato, e il client tiene
      l'ultima fila buona (le schede sono struttura, non un contatore: sparire a ogni lettura
      storta renderebbe la vista inagibile).
    */
    const schedeComuni = f.famiglia === 'massive'
      ? comuniMassiveAperti(supabaseAdmin).catch((e): null => {
          console.error('[acea/ordini] comuni massive non letti:', e);
          return null;
        })
      : Promise.resolve<string[] | null>(null);

    let righe: OrdineRow[];
    let totale: number;

    if (!serveIncrocio(f)) {
      // Percorso normale: una sola interrogazione paginata, il conteggio lo fa Postgres.
      const { data, error, count } = await queryRegistro(COLONNE, f, oggi).range(da, a);
      if (error) throw error;
      righe = (data ?? []) as unknown as OrdineRow[];
      totale = count ?? righe.length;
    } else {
      /*
        Percorso di INCROCIO, per i due filtri che non vivono nel registro.

        Esecutore e Data pianificata stanno in `interventi`: Postgres non può filtrarli dentro la
        query su `acea_ordini`, e passargli la lista degli ODL sarebbe una URL da decine di
        migliaia di caratteri. Quindi si scaricano le sole CHIAVI che passano i criteri ACEA
        (~5.300 coppie odl+operazione, una manciata di richieste su due colonne corte), si
        incrociano in memoria con gli interventi, e si impagina il risultato dell'incrocio.

        È l'unico modo per far dire la verità al conteggio: filtrare le 300 righe già scese
        mostrerebbe «12 di 871» quando i non pianificati sono 400. Si paga solo quando uno dei due
        filtri è acceso — la vista normale resta una query sola.
      */
      /*
        L'indice COMPLETO solo quando il criterio tocca tutto il registro (filtri di
        pianificazione, ordinamento per esecutore/data). La scheda riaperture da sola usa la
        versione mirata sugli ODL scesi dalla scansione — che Postgres ha già ridotto a poche
        decine — e la scheda saracinesche senza filtri non ha bisogno di nessun indice.
      */
      const serveIndiceCompleto =
        filtriPianificazioneAttivi(f.pianificazione) || ordinamentoDaIncrociare(f);
      const [chiavi, indiceCompleto, saracinesche] = await Promise.all([
        scansionaChiavi(f, oggi),
        serveIndiceCompleto ? indicePianificazione(f) : Promise.resolve(null),
        f.stato === 'saracinesche'
          ? odlConSaracinescaDichiarata(supabaseAdmin)
          : Promise.resolve(new Set<string>()),
      ]);
      const indice = indiceCompleto
        ?? (f.stato === 'riaperture'
          ? await indicePianificazionePerOdl(chiavi.map((k) => k.odl))
          : new Map<string, never>() as IndicePianificazione);
      // La chiave con cui una riga della scansione cerca nei tre indici qui sopra.
      const chiaveDi = (k: Chiave): string =>
        chiaveAggancioIntervento(f.famiglia, k.odl, k.matricola);

      // Nomi scelti → staff_id. Il filtro parla di persone, il registro di identificativi.
      const staffScelti = new Set<string>();
      if (f.pianificazione.esecutori.length > 0) {
        const { data: staff, error: eStaff } = await supabaseAdmin
          .from('staff')
          .select('id, display_name')
          .in('display_name', f.pianificazione.esecutori);
        if (eStaff) throw eStaff;
        for (const s of (staff ?? []) as Array<{ id: string }>) staffScelti.add(s.id);
      }

      let passate = chiavi.filter(
        (k) => (f.stato !== 'saracinesche' || saracinesche.has(k.odl))
          // La coda delle riaperture: fuori le completate nei rapportini. Le chiuse su ACEA sono
          // gia` fuori dalla query (`aperto=true` in `queryRegistro`).
          && (f.stato !== 'riaperture' || indice.get(chiaveDi(k))?.completato !== true)
          && passaPianificazione(chiaveDi(k), f.pianificazione, indice, staffScelti),
      );
      /*
        Ordinamento delle due colonne che non stanno nel registro.

        Si fa QUI, sull'insieme completo delle chiavi che hanno passato i filtri, e non sulla
        pagina: ordinare la pagina mostrerebbe «il primo esecutore» delle 300 righe scese invece
        che del registro — lo stesso difetto che i filtri hanno gia` evitato.
      */
      const scelto = f.ordina === null ? null : ORDINAMENTI[f.ordina];
      if (scelto?.tipo === 'incrocio') {
        const nomi = await nomiStaff();
        const valore = (chiave: string): string => {
          const v = indice.get(chiave);
          if (!v) return '';
          if (f.ordina === 'pianificato_il') {
            // Il giorno PIÙ RECENTE, come la colonna che si vede: ordinare su un altro
            // intervento della stessa unità darebbe una tabella che non segue la sua colonna.
            return [...v.giorni].sort().at(-1) ?? '';
          }
          return [...v.staff].map((id) => nomi.get(id) ?? '').sort()[0] ?? '';
        };
        const segno = f.verso === 'asc' ? 1 : -1;
        passate = [...passate].sort((a, b) => {
          const va = valore(chiaveDi(a));
          const vb = valore(chiaveDi(b));
          // I vuoti in fondo in ENTRAMBI i versi: «non pianificato» non e` un valore piccolo,
          // e` un valore assente, e in cima somiglierebbe a un risultato.
          if (va === '' && vb !== '') return 1;
          if (vb === '' && va !== '') return -1;
          if (va !== vb) return va.localeCompare(vb, 'it') * segno;
          // Spareggio stabile, o la paginazione ripeterebbe righe.
          return a.odl.localeCompare(b.odl) || a.numero_operazione.localeCompare(b.numero_operazione);
        });
      }

      totale = passate.length;

      const pagina = passate.slice(da, a + 1);
      if (pagina.length === 0) {
        righe = [];
      } else {
        // Solo le righe della pagina: al massimo `perPagina` ODL, quindi un `in` corto.
        const { data, error } = await supabaseAdmin
          .from(PROFILO_COMMESSA[f.famiglia ?? 'dunning'].tabellaOrdini)
          .select(COLONNE)
          .in('odl', [...new Set(pagina.map((k) => k.odl))]);
        if (error) throw error;
        const perChiave = new Map(
          ((data ?? []) as unknown as OrdineRow[]).map((r) => [`${r.odl}|${r.numero_operazione}`, r]),
        );
        // Riordinate come le chiavi: `in` non conserva l'ordine, e un ODL con più operazioni ne
        // riporta indietro anche di non richieste.
        righe = pagina
          .map((k) => perChiave.get(`${k.odl}|${k.numero_operazione}`))
          .filter((r): r is OrdineRow => Boolean(r));
      }
    }

    const odlPagina = [...new Set(righe.map((r) => r.odl))];

    // Pianificazione da mostrare: solo per gli ODL della pagina corrente (non per tutto il
    // registro). Anche nel percorso di incrocio si rilegge da qui, perché serve pure lo `stato`
    // e l'intervento PIÙ RECENTE, che il predicato non guarda.
    const pianificazione = new Map<string, { data: string | null; staff_id: string | null; stato: string | null }>();
    // Gli interventi della pagina per unità, dal più recente: da qui si pesca l'esito scritto nel
    // rapportino (colonna «Eseguito», più sotto).
    const interventiPerChiave = new Map<string, string[]>();
    if (odlPagina.length > 0) {
      const profilo = PROFILO_COMMESSA[f.famiglia ?? 'dunning'];
      for (let i = 0; i < odlPagina.length; i += 200) {
        const blocco = odlPagina.slice(i, i + 200);
        const { data: interventi, error: eInt } = await supabaseAdmin
          .from('interventi')
          .select('id, odl, data, staff_id, stato, matricola_contatore')
          .in('odl', blocco)
          .in('committente', [...profilo.committenti])
          .order('data', { ascending: false });
        if (eInt) throw eInt;
        for (const it of (interventi ?? []) as VoceIntervento[]) {
          // Un annullato non si mostra: in colonna Esecutore comparirebbe il nome di chi non ci
          // va — e il badge, che gli annullati li scarta, direbbe «senza esecutore» su una riga
          // che un nome lo mostra. Stessa esclusione dell'indice dei filtri, qui sopra.
          if (it.stato === 'annullato') continue;
          if (!it.odl) continue;
          /*
            Più interventi sulla stessa unità: vince la pianificazione CORRENTE, cioè l'intervento
            APERTO più recente (l'ordinamento discendente fa incontrare prima i più recenti); le
            uscite già registrate (completato) si mostrano solo se non c'è niente in corso. Prima
            vinceva il più recente in assoluto: su un ODL con sei uscite a vuoto e una
            ripianificazione in corso la colonna mostrava l'uscita vecchia, e la scrittura appena
            fatta sembrava non aver fatto niente.
          */
          const chiave = chiaveAggancioIntervento(f.famiglia, it.odl, it.matricola_contatore);
          const prev = pianificazione.get(chiave);
          if (!prev || (prev.stato === 'completato' && it.stato !== 'completato')) {
            pianificazione.set(chiave, { data: it.data, staff_id: it.staff_id, stato: it.stato });
          }
          if (it.id) interventiPerChiave.set(chiave, [...(interventiPerChiave.get(chiave) ?? []), it.id]);
        }
      }
    }

    /*
      ---- Le colonne che vengono DAL RAPPORTINO -------------------------------------------------

      Due colonne, due viste, una sola lettura di `rapportino_voci`:

      · «Eseguito» (MASSIVE) — l'esito che ha scritto chi ci è andato. Stessa colonna del modulo
        Interventi e stessa fonte, `risposte.eseguito`, normalizzata dalla stessa `siNo`, così le
        due schermate non possono dire cose diverse sullo stesso lavoro.
      · «Matricola nuova» (ACQUALATINA) — la matricola del misuratore INSTALLATO, `risposte
        .matricola_nuova`, l'azione che l'operatore scansiona o digita sul posto. Il registro dice
        già quale contatore va sostituito; questa dice quale ci è finito davvero.

      Vince l'ULTIMO valore registrato, non l'intervento mostrato in colonna Esecutore: quello è la
      pianificazione corrente, e su un ordine ripianificato dopo un'uscita andata a buon fine
      sarebbe una cella vuota sopra un lavoro fatto. Gli interventi arrivano già dal più recente,
      quindi basta fermarsi al primo che una risposta ce l'ha.

      DECORAZIONE, come le due della saracinesca: se la lettura fallisce le colonne restano vuote e
      la tabella si carica lo stesso. Il registro è il motivo per cui si apre la schermata.

      Ognuna solo sulla vista che la disegna: altrove sarebbe una lettura in più a ogni pagina per
      un valore che nessuno guarda — la stessa regola con cui il triangolo delle riaperture e le
      schede-comune non si calcolano fuori casa loro. Se un giorno le viste che leggono le risposte
      diventassero tre, la lettura resta questa: si aggiunge un estrattore, non una query.
    */
    const eseguitoPerChiave = new Map<string, string>();
    const matricolaNuovaPerChiave = new Map<string, string>();
    const serveEseguito = f.famiglia === 'massive';
    if ((serveEseguito || acqua) && interventiPerChiave.size > 0) {
      try {
        const ids = [...new Set([...interventiPerChiave.values()].flat())];
        const eseguitoPerIntervento = new Map<string, string>();
        const matricolaPerIntervento = new Map<string, string>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await supabaseAdmin
            .from('rapportino_voci')
            .select('intervento_id, risposte')
            .in('intervento_id', ids.slice(i, i + 200));
          if (error) throw error;
          for (const v of (data ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>) {
            if (!v.intervento_id) continue;
            const risposte = v.risposte ?? {};
            if (serveEseguito && !eseguitoPerIntervento.has(v.intervento_id)) {
              const val = siNo(risposte['eseguito']);
              // '—' = campo mai compilato: non è un esito, ed è la differenza fra «non ancora
              // lavorato» e «lavorato e andato male».
              if (val !== '—') eseguitoPerIntervento.set(v.intervento_id, val);
            }
            if (acqua && !matricolaPerIntervento.has(v.intervento_id)) {
              const m = String(risposte['matricola_nuova'] ?? '').trim();
              if (m !== '') matricolaPerIntervento.set(v.intervento_id, m);
            }
          }
        }
        for (const [chiave, lista] of interventiPerChiave) {
          const eseguito = lista.map((id) => eseguitoPerIntervento.get(id)).find(Boolean);
          if (eseguito) eseguitoPerChiave.set(chiave, eseguito);
          const matricola = lista.map((id) => matricolaPerIntervento.get(id)).find(Boolean);
          if (matricola) matricolaNuovaPerChiave.set(chiave, matricola);
        }
      } catch (e) {
        console.error('[acea/ordini] risposte dei rapportini non lette:', e);
      }
    }

    /*
      Le due letture della saracinesca sono DECORAZIONI: se falliscono, la tabella deve caricarsi
      lo stesso senza quelle colonne.

      Prima erano fatali, e una di loro ha portato giu` l'intero registro: la pagina mostrava
      «Errore lettura registro ACEA» per un dato che sta in due colonne accessorie. Il registro e`
      il motivo per cui si apre questa schermata; la saracinesca e` un di piu` — degradarla in
      silenzio-con-log e` giusto, farci cadere tutto no.
    */
    // Le saracinesche sono un fatto ACEA (dichiarazioni del master, ordini di sostituzione):
    // sulla vista acqualatina le due letture non partono proprio — pagherebbero due scansioni
    // per decorare colonne che quella tabella nemmeno disegna.
    const dichiarati = acqua
      ? new Set<string>()
      : await odlConSaracinescaDichiarata(supabaseAdmin).catch((e) => {
        console.error('[acea/ordini] dichiarazioni saracinesca non lette:', e);
        return new Set<string>();
      });
    const sostituzioni = acqua
      ? new Map<string, Sostituzione>()
      : await indiceSostituzioni().catch((e) => {
        console.error('[acea/ordini] ordini di sostituzione non letti:', e);
        return new Map<string, Sostituzione>();
      });

    /*
      Gli APPUNTI della pagina: la pianificazione scritta a metà.

      Lettura a parte e best-effort, come le due della saracinesca: se la migration che aggiunge le
      colonne non è ancora passata, la tabella si carica senza gli appunti invece di non caricarsi.
    */
    type Bozza = { staff_id: string | null; data: string | null };
    const bozze = new Map<string, Bozza>();
    if (righe.length > 0) {
      const chiaviPagina = righe.map((r) => `${r.odl}|${r.numero_operazione}`);
      const { data: righeBozza, error: eBozza } = await supabaseAdmin
        .from(PROFILO_COMMESSA[f.famiglia ?? 'dunning'].tabellaOrdini)
        .select('odl, numero_operazione, pianificato_a_bozza, pianificato_il_bozza')
        .in('odl', odlPagina);
      if (eBozza) {
        console.error('[acea/ordini] appunti di pianificazione non letti:', eBozza);
      } else {
        for (const r of (righeBozza ?? []) as Array<Record<string, unknown>>) {
          const chiave = `${String(r.odl)}|${String(r.numero_operazione)}`;
          if (!chiaviPagina.includes(chiave)) continue;
          bozze.set(chiave, {
            staff_id: (r.pianificato_a_bozza as string | null) ?? null,
            data: (r.pianificato_il_bozza as string | null) ?? null,
          });
        }
      }
    }

    // Nomi operatore: staff_id → display_name, per non mostrare uuid in tabella. Anche quelli
    // degli APPUNTI: una riga a metà mostra il nome scelto, non l'uuid con cui è memorizzato.
    const staffIds = [...new Set([
      ...[...pianificazione.values()].map((p) => p.staff_id),
      ...[...bozze.values()].map((b) => b.staff_id),
    ].filter(Boolean))] as string[];
    const nomi = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staff } = await supabaseAdmin.from('staff').select('id, display_name').in('id', staffIds);
      for (const s of (staff ?? []) as Array<{ id: string; display_name: string }>) nomi.set(s.id, s.display_name);
    }

    const conPianificazione = righe.map((r) => {
      const chiaveRiga = chiaveAggancioIntervento(f.famiglia, r.odl, r.matricola as string | null);
      const p = pianificazione.get(chiaveRiga);
      // L'ordine di sostituzione si cerca per impianto O per matricola, non per ODL: la
      // sostituzione e` un ordine SUO, con un numero diverso da quello della limitazione.
      const sost = chiaviAggancio({ impianto: r.impianto as string | null, matricola: r.matricola as string | null })
        .map((k) => sostituzioni.get(k))
        .find(Boolean);
      /*
        La pianificazione a metà si mostra al posto di quella vera, quando quella vera non c'è.

        «Quella vera» è un intervento IN CORSO: l'aperto vince sempre — un valore che sembra una
        pianificazione ma non genera nessun rapportino è peggio di una cella vuota. Un'uscita già
        registrata (completato) invece non lo è: su una riga con sole uscite a vuoto l'appunto
        appena scritto vince, o la scrittura sparirebbe dietro l'uscita vecchia. La riga porta
        `pianificazione_parziale` perché la tabella dica a vista che è una metà.
      */
      const bozza = bozze.get(`${r.odl}|${r.numero_operazione}`);
      const bozzaStaff = bozza?.staff_id ?? null;
      const bozzaData = bozza?.data ?? null;
      const inCorso = p && p.stato !== 'completato' ? p : null;
      const parziale = !inCorso && Boolean(bozzaStaff || bozzaData);
      const mostrato = inCorso
        ?? (parziale ? { data: bozzaData, staff_id: bozzaStaff, stato: null } : p ?? null);
      return {
        ...r,
        saracinesca:
          dichiarati.has(r.odl) && saracinescaContemplata(r.attivita as string | null)
            ? 'SI'
            : null,
        odl_saracinesca: sost?.odl ?? null,
        stato_saracinesca: sost?.stato ?? null,
        pianificato_il: mostrato?.data ?? null,
        pianificato_a: mostrato?.staff_id
          ? (nomi.get(mostrato.staff_id) ?? mostrato.staff_id)
          : null,
        pianificazione_parziale: parziale,
        stato_intervento: mostrato?.stato ?? null,
        eseguito: eseguitoPerChiave.get(chiaveRiga) ?? null,
        matricola_nuova: matricolaNuovaPerChiave.get(chiaveRiga) ?? null,
      };
    });

    return NextResponse.json(
      {
        righe: conPianificazione,
        totale,
        pagina: f.pagina,
        perPagina: f.perPagina,
        oggi,
        // Il triangolo della scheda «Riaperture»: aggiornato a ogni ricarica della tabella, così
        // pianificare o importare lo muove senza una chiamata in più. `null` = non calcolabile.
        riapertureSenzaData: await triangolo,
        // Le schede-comune della vista massive, aggiornate a ogni ricarica per la stessa ragione:
        // un import che aggiunge un paese fa comparire il tasto da solo. `null` = non calcolato.
        comuniMassive: await schedeComuni,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    /*
      L'errore va anche nei LOG, non solo nella risposta.

      Finiva solo nel corpo JSON: dal browser si vedeva «Errore lettura registro ACEA» e basta, e
      per capire cosa fosse davvero non restava che indovinare guardando il diff. Un percorso
      d'errore che non lascia traccia costa piu` di quanto costi scriverlo.
    */
    console.error('[acea/ordini] lettura fallita:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura registro ACEA.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/acea/ordini — i contatori di testa del modulo.
 *
 * Query separata dai filtri perché sono i numeri che il modulo mostra in apertura, sempre gli
 * stessi e indipendenti da cosa l'utente sta filtrando. POST e non GET solo per non confondersi
 * con la lista sullo stesso path: non riceve corpo.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const oggi = partiRoma(new Date()).oggi;
    const conta = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count, error } = await build(base());
      if (error) throw error;
      return count ?? 0;
    };
    function base() {
      return supabaseAdmin.from('acea_ordini').select('odl', { count: 'exact', head: true });
    }

    const traSetteGiorni = new Date(Date.parse(`${oggi}T00:00:00Z`) + 7 * 86_400_000)
      .toISOString().slice(0, 10);
    /*
      Le scadenze anche PER FAMIGLIA, oltre che globali: le viste-foglietta mostrano i propri
      numeri, e il totale globale spacciato per numero della vista era una bugia silenziosa —
      sulla scheda massive «oltre la scadenza» contava anche tutto il dunning. I globali
      restano: sull'hub del modulo sono loro il dato giusto.
    */
    const [
      apertiDunning, apertiMassive, scaduti, inScadenza, senzaMisuratore,
      scadutiDunning, inScadenzaDunning, scadutiMassive, inScadenzaMassive,
    ] = await Promise.all([
      conta((q) => q.eq('famiglia', 'dunning').eq('aperto', true)),
      conta((q) => q.eq('famiglia', 'massive').eq('aperto', true)),
      conta((q) => q.eq('aperto', true).lt('scadenza', oggi)),
      conta((q) => q.eq('aperto', true).gte('scadenza', oggi).lte('scadenza', traSetteGiorni)),
      conta((q) => q.is('impianto', null).is('matricola', null)),
      conta((q) => q.eq('famiglia', 'dunning').eq('aperto', true).lt('scadenza', oggi)),
      conta((q) => q.eq('famiglia', 'dunning').eq('aperto', true).gte('scadenza', oggi).lte('scadenza', traSetteGiorni)),
      conta((q) => q.eq('famiglia', 'massive').eq('aperto', true).lt('scadenza', oggi)),
      conta((q) => q.eq('famiglia', 'massive').eq('aperto', true).gte('scadenza', oggi).lte('scadenza', traSetteGiorni)),
    ]);

    const { data: ultimo } = await supabaseAdmin
      .from('acea_import')
      .select('caricato_il, righe_totali, finestra_dal, finestra_al')
      .order('caricato_il', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json(
      {
        oggi,
        // L'orologio del SERVER: l'età dell'ultimo import si calcolava su quello del browser, che
        // può essere sfasato di ore. Su un contatore il cui scopo è dire «questo dato è vecchio»,
        // un orologio sbagliato produce esattamente l'errore che il contatore dovrebbe impedire.
        adesso: new Date().toISOString(),
        apertiDunning, apertiMassive, scaduti, inScadenza, senzaMisuratore,
        scadutiDunning, inScadenzaDunning, scadutiMassive, inScadenzaMassive,
        ultimoImport: ultimo ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore riepilogo ACEA.' },
      { status: 500 },
    );
  }
}
