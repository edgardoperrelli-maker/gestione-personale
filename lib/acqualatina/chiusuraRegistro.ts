// lib/acqualatina/chiusuraRegistro.ts
// PURA: dai NOSTRI rapportini allo stato della riga di registro AcquaLatina.
//
// ACEA chiude i suoi ordini con l'export del Cruscotto; AcquaLatina non ci rimanda niente, quindi
// qui la chiusura la scrive il nostro motore — un intervento `completato` con esito porta lo stato
// sulla riga di `acqualatina_ordini` a cui è agganciato (`ordine_id`).
//
// L'INVARIANTE, e la metà che mancava:
//
//   POSITIVO   il lavoro è fatto, la riga si chiude e non si ripianifica mai più. È la stessa
//              «ODL positivo = definitivamente chiuso» dell'indice unique e di `pianoPianificazione`.
//   NEGATIVO   NON chiude niente. Un'uscita a vuoto — utente assente, contatore inaccessibile — è
//              un tentativo, non un esito della commessa: il contatore è ancora lì da sostituire e
//              la squadra ci deve tornare. La riga resta APERTA, e dice che l'ultima uscita è
//              andata a vuoto.
//
// La prima versione chiudeva su QUALUNQUE esito. Il 03/08/2026 le 12 righe di via Tuccia esitate
// negative sono finite in «Chiusi» con `aperto = false`, e riassegnarle a un altro operatore
// rispondeva «ordine già chiuso su ACEA» su una commessa che con ACEA non c'entra: lavoro vero,
// ancora da fare, che il registro dichiarava concluso.

/** Un intervento della commessa già chiuso dall'operatore, come lo legge la route. */
export type InterventoConcluso = {
  /** `acqualatina_ordini.id`: il collegamento che la pianificazione scrive alla creazione. */
  ordine_id: string | null;
  data: string | null;
  esito: string | null;
  /**
   * La risposta `eseguito` della VOCE di rapportino: `SI` | `NO` | `NESSUN PASSAGGIO`.
   *
   * Serve perché `interventi.esito` distingue solo il positivo da tutto il resto, e la regola di
   * questa commessa vive proprio nella differenza fra i due negativi: il NO è definitivo, il
   * «nessun passaggio» è un giro che non c'è stato.
   */
  eseguito?: string | null;
};

/** Un intervento SENZA il collegamento: `ordine_id` mai scritto. Anche APERTO — l'aggancio
 *  serve pure a lui: senza, le correzioni anagrafiche del sync non lo raggiungono e la
 *  tabella del registro non lo mostra fra Esecutore/Data pianificata.
 *
 *  I campi anagrafici (`pdr`…`cap`) sono opzionali e servono solo al «primo scatto» in
 *  `patchAggancioAnagrafica`: senza `ordine_id` non poteva mai arrivarci una fotografia,
 *  quindi qui si legge cos'ha già l'intervento per capire cosa manca ancora. */
export type InterventoSciolto = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  data: string | null;
  esito: string | null;
  stato?: string | null;
  pdr?: string | null;
  nominativo?: string | null;
  recapito?: string | null;
  indirizzo?: string | null;
  comune?: string | null;
  cap?: string | null;
};

/** La riga di registro come serve all'aggancio: identità e matricola normalizzata.
 *  I campi anagrafici sono opzionali: servono solo al «primo scatto» qui sotto, e restano
 *  assenti nei punti che leggono la riga solo per l'identità (es. `riconciliaRegistro`
 *  quando cerca l'ODL). */
export type RigaPerAggancio = {
  id: string;
  odl: string;
  matricola_norm: string | null;
  impianto?: string | null;
  nominativo?: string | null;
  recapito?: string | null;
  via?: string | null;
  civico?: string | null;
  comune?: string | null;
  cap?: string | null;
  matricola?: string | null;
};

/** Come `normMatricola` di ordiniDaMaster: qui per non importare il modulo del sync intero. */
const normMatr = (m: string | null | undefined): string =>
  String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Gli agganci mancanti: quale riga di registro appartiene a un intervento concluso senza
 * `ordine_id`.
 *
 * Il collegamento lo scrive la pianificazione alla creazione — ma non tutti gli interventi
 * nascono da lì: quelli del vecchio percorso su file (e le ricostruzioni) sono nati senza, e
 * per la riconciliazione erano invisibili. Il caso vero è il 12379075 del 03/08: eseguito
 * positivo dall'operatore, riga di registro rimasta «Aperta», e il confronto col sito che lo
 * segnala fra i «manca il nostro esito» — 77 interventi così alla prima misura (04/08).
 *
 * La regola è prudente: si aggancia per ODL solo quando la scelta è OBBLIGATA — l'ODL ha una
 * riga sola, oppure la matricola dell'intervento ne indica esattamente una. Un ODL
 * multi-contatore senza matricola che decida resta sciolto: meglio un aggancio in meno di un
 * esito scritto sul contatore sbagliato.
 *
 * Quando l'ODL non individua NESSUNA riga si ripiega sulla MATRICOLA, con la stessa prudenza:
 * solo se ne indica esattamente una in tutto il registro. Il caso è quello dei «+» compilati
 * sul campo, dove l'operatore ha in mano il contatore e non il numero d'ordine — l'11/08/2026
 * cinque richieste manuali sono nate con l'ODL vuoto (una con la matricola copiata dentro il
 * campo ODL), e senza questo ripiego le loro righe di registro non avevano alcun modo di
 * ritrovare l'intervento: restavano aperte a lavoro fatto. La matricola è l'identità del
 * pezzo sostituito, ed è l'unica cosa che l'operatore non può sbagliare avendocela in mano.
 */
export function agganciPerOdl(
  sciolti: readonly InterventoSciolto[],
  righe: readonly RigaPerAggancio[],
): Array<{ interventoId: string; ordineId: string }> {
  const perOdl = new Map<string, RigaPerAggancio[]>();
  const perMatricola = new Map<string, RigaPerAggancio[]>();
  for (const r of righe) {
    const odl = r.odl.trim();
    if (odl !== '') perOdl.set(odl, [...(perOdl.get(odl) ?? []), r]);
    const m = normMatr(r.matricola_norm);
    if (m !== '') perMatricola.set(m, [...(perMatricola.get(m) ?? []), r]);
  }
  const agganci: Array<{ interventoId: string; ordineId: string }> = [];
  for (const s of sciolti) {
    const candidate = perOdl.get(String(s.odl ?? '').trim()) ?? [];
    const m = normMatr(s.matricola_contatore);
    let scelta: RigaPerAggancio | null = candidate.length === 1 ? candidate[0] : null;
    if (!scelta && candidate.length > 1) {
      const stesse = m === '' ? [] : candidate.filter((c) => normMatr(c.matricola_norm) === m);
      if (stesse.length === 1) scelta = stesse[0];
    }
    // L'ODL non ha trovato niente: né vuoto né sconosciuto al registro decidono, la matricola sì.
    if (!scelta && candidate.length === 0 && m !== '') {
      const perM = perMatricola.get(m) ?? [];
      if (perM.length === 1) scelta = perM[0];
    }
    if (scelta) agganci.push({ interventoId: s.id, ordineId: scelta.id });
  }
  return agganci;
}

/** Le colonne che l'aggancio può riempire sull'intervento. */
export type PatchAggancioAnagrafica = Partial<{
  pdr: string;
  nominativo: string;
  recapito: string;
  indirizzo: string;
  comune: string;
  cap: string;
  matricola_contatore: string;
}>;

const vuoto = (v: string | null | undefined): boolean => String(v ?? '').trim() === '';

/**
 * L'anagrafica da scrivere sull'intervento appena agganciato: SOLO i campi ancora vuoti.
 *
 * Non è la «correzione» del sync (`ordini/sync/route.ts`), che sovrascrive un valore già
 * presente perché il file del committente è la fonte: qui l'intervento non ha MAI avuto
 * `ordine_id`, quindi nessun meccanismo ha mai potuto scrivergli un valore — non c'è una
 * fotografia da rispettare o falsificare, solo un vuoto da riempire. Per questo vale anche
 * sui COMPLETATI (a differenza della propagazione del sync, che li esclude apposta): è
 * esattamente il buco del 12379075 del 03/08, eseguito positivo dall'operatore ma senza PDR
 * perché l'aggancio gli ha dato l'`ordine_id` senza mai portargli dietro l'anagrafica.
 */
export function patchAggancioAnagrafica(
  ordine: RigaPerAggancio,
  intervento: InterventoSciolto,
): PatchAggancioAnagrafica {
  const patch: PatchAggancioAnagrafica = {};
  if (vuoto(intervento.pdr) && !vuoto(ordine.impianto)) patch.pdr = String(ordine.impianto).trim();
  if (vuoto(intervento.nominativo) && !vuoto(ordine.nominativo)) {
    patch.nominativo = String(ordine.nominativo).trim();
  }
  if (vuoto(intervento.recapito) && !vuoto(ordine.recapito)) patch.recapito = String(ordine.recapito).trim();
  if (vuoto(intervento.indirizzo) && (!vuoto(ordine.via) || !vuoto(ordine.civico))) {
    patch.indirizzo = [ordine.via, ordine.civico].filter((v) => !vuoto(v)).join(' ').trim();
  }
  if (vuoto(intervento.comune) && !vuoto(ordine.comune)) patch.comune = String(ordine.comune).trim();
  if (vuoto(intervento.cap) && !vuoto(ordine.cap)) patch.cap = String(ordine.cap).trim();
  if (vuoto(intervento.matricola_contatore) && !vuoto(ordine.matricola)) {
    patch.matricola_contatore = String(ordine.matricola).trim();
  }
  return patch;
}

/** Le colonne di stato della riga di registro, riscritte in blocco. */
export type PatchRiga = {
  aperto: boolean;
  stato: string;
  stato_desc: string;
  /** `null` solo sulla RIAPERTURA: la riga torna «mai esitata», non «esitata negativa». */
  esito_positivo: boolean | null;
  data_completamento: string | null;
};

export type GruppoChiusura = {
  /** Cosa diventa la riga: decide la patch e l'ordine di applicazione. */
  esito: EsitoRiga;
  /** Gli `acqualatina_ordini.id` da aggiornare con questa patch. */
  ids: string[];
  patch: PatchRiga;
};

/**
 * Lo stato scritto dal sync dal master, per le righe mai lavorate. Vive qui insieme agli altri
 * due: sono i tre valori che la colonna «Stato» può assumere su questa commessa, e quindi le tre
 * voci del suo imbuto — averli sparsi fra la route del sync e questa significherebbe scoprire da
 * un filtro che uno dei tre si scrive in un altro modo.
 */
export const STATO_APERTA = 'APERTA';

/** Riga chiusa col lavoro FATTO: l'unico stato definitivo della commessa. */
export const STATO_CHIUSA_ESEGUITA = 'CHIUSA — ESEGUITA';

/**
 * Riga ancora APERTA, con l'ultima uscita andata a vuoto.
 *
 * Il testo porta i due pezzi — com'è messa la riga e com'è finita l'uscita — perché l'imbuto della
 * colonna «Stato» filtra sul valore di `stato_desc` così com'è nel registro: è questa stringa a
 * dare all'ufficio la coda «da ripassare» in un clic, ed è il motivo per cui la vista AcquaLatina
 * non ricompone l'etichetta a schermo come fa con gli stati di ACEA.
 */
export const STATO_APERTA_NON_ESEGUITA = 'APERTA — NON ESEGUITA';

/**
 * Riga CHIUSA senza che il lavoro sia stato fatto: l'esito `NO` della commessa.
 *
 * Su AcquaLatina il NO è definitivo — il contatore non c'è più, l'impianto è dismesso, l'utente
 * rifiuta — quindi non c'è niente da ripianificare e tenere la riga in coda è rumore. È lo stato
 * che mancava: prima una riga o era fatta, o era ancora da fare.
 */
export const STATO_CHIUSA_NON_ESEGUITA = 'CHIUSA — NON ESEGUITA';

/**
 * Il `NO` chiude solo dalle uscite di questo giorno in poi.
 *
 * La riconciliazione rigira su TUTTI gli interventi completati a ogni apertura della tabella:
 * senza barriera chiuderebbe anche le righe già esitate NO prima che la regola esistesse, che per
 * decisione esplicita restano dove sono. Invecchia da sola — fra un mese non filtra più niente e
 * resta come traccia del giorno in cui la regola è cambiata.
 */
export const NO_CHIUDE_DAL = '2026-08-05';

/** Cosa diventa la riga di registro dopo un'uscita. */
export type EsitoRiga = 'positivo' | 'chiusa_non_eseguita' | 'aperta_non_eseguita';

const PATCH_ESEGUITA = (data: string | null): PatchRiga => ({
  aperto: false,
  stato: 'CHIUSO',
  stato_desc: STATO_CHIUSA_ESEGUITA,
  esito_positivo: true,
  data_completamento: data,
});

const PATCH_NON_ESEGUITA: PatchRiga = {
  aperto: true,
  stato: 'APERTO',
  stato_desc: STATO_APERTA_NON_ESEGUITA,
  esito_positivo: false,
  /*
    Nessuna data di chiusura: la riga NON è chiusa, e la colonna si chiama «Chiusa il». Il giorno
    del tentativo non si perde — resta sull'intervento, e la tabella lo mostra nelle sue colonne
    «Esecutore»/«Data pianificata», che è dove si guarda chi c'è già andato.
  */
  data_completamento: null,
};

const PATCH_CHIUSA_NON_ESEGUITA = (data: string | null): PatchRiga => ({
  aperto: false,
  stato: 'CHIUSO',
  stato_desc: STATO_CHIUSA_NON_ESEGUITA,
  esito_positivo: false,
  // L'uscita c'è stata ed è quella che ha chiuso la partita: «Chiusa il» ha un giorno da mostrare.
  data_completamento: data,
});

/** La risposta della voce, confrontabile: gli operatori scrivono con spazi e maiuscole loro. */
function rispostaNorm(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Cosa diventa la riga, data l'uscita.
 *
 * L'ordine dei controlli È la regola:
 *  1. il POSITIVO vince sempre, anche su una voce che dice altro (un residuo non riapre il lavoro);
 *  2. il NO chiude, ma solo dalle uscite dal giorno del taglio in poi;
 *  3. tutto il resto — «nessun passaggio», nessuna risposta, un NO troppo vecchio — lascia la riga
 *     aperta, che è il caso che la decisione del 03/08 proteggeva.
 */
export function esitoRiga(c: InterventoConcluso): EsitoRiga {
  if (c.esito === 'eseguito_positivo') return 'positivo';
  const risposta = rispostaNorm(c.eseguito);
  // Senza data non si sa da che parte del taglio sta l'uscita: non si chiude.
  if (risposta === 'NO' && (c.data ?? '') >= NO_CHIUDE_DAL) return 'chiusa_non_eseguita';
  return 'aperta_non_eseguita';
}

/**
 * Fra le risposte `eseguito` delle voci che condividono UN intervento, quella che decide.
 *
 * Un intervento dovrebbe avere una voce sola, ma può ritrovarsene più d'una: la pianificazione
 * lo sposta su un altro operatore o un altro giorno e la voce di prima resta indietro (ODL
 * 12378907, «NESSUN PASSAGGIO» del 12/08 e «SI» del 13/08 sullo stesso intervento). La
 * riconciliazione prendeva la PRIMA che le capitava sotto — e l'ordine di una select senza
 * `order by` non è un ordine: la stessa riga di registro poteva chiudersi o restare aperta a
 * seconda del giro.
 *
 * La precedenza è quella di `RANGO`, letta dal lato della voce: il lavoro FATTO vince su tutto,
 * poi il NO che chiude, poi il giro che non c'è stato. È la stessa frase di `esitoRiga` —
 * «il POSITIVO vince sempre, anche su una voce che dice altro» — applicata un gradino prima,
 * dove le voci sono ancora più d'una.
 */
export function rispostaPrevalente(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  const rango = (r: string | null | undefined): number => {
    const v = rispostaNorm(r);
    if (v === 'SI') return 3;
    if (v === 'NO') return 2;
    return v === '' ? 0 : 1;
  };
  return rango(b) > rango(a) ? rispostaNorm(b) : rispostaNorm(a);
}

/** L'ordine di applicazione a parità di giorno: il positivo per ultimo, così vince lui. */
const RANGO: Record<EsitoRiga, number> = {
  aperta_non_eseguita: 0,
  chiusa_non_eseguita: 1,
  positivo: 2,
};

const PATCH_PER_ESITO: Record<EsitoRiga, (data: string | null) => PatchRiga> = {
  positivo: PATCH_ESEGUITA,
  chiusa_non_eseguita: PATCH_CHIUSA_NON_ESEGUITA,
  aperta_non_eseguita: () => PATCH_NON_ESEGUITA,
};

/**
 * La patch che RIAPRE una riga chiusa positiva rimasta senza il suo intervento positivo.
 *
 * Torna «Aperta», come mai lavorata: se dell'ordine resta un'uscita negativa, il gruppo
 * negativo della stessa riconciliazione la rimarca subito «Aperta — non eseguita» (la
 * riapertura gira PRIMA dei gruppi, apposta).
 */
export const PATCH_RIAPERTA: PatchRiga = {
  aperto: true,
  stato: 'APERTO',
  stato_desc: STATO_APERTA,
  esito_positivo: null,
  data_completamento: null,
};

/**
 * Le righe chiuse positive da RIAPRIRE: quelle il cui ordine non ha più NESSUN intervento
 * completato con esito positivo.
 *
 * È la seconda metà di «il positivo è definitivo». La guardia dei gruppi impedisce a
 * un'uscita successiva di contraddire una chiusa positiva — giusto: il lavoro fatto resta
 * fatto. Ma quando l'ufficio CORREGGE l'esito dell'intervento (il positivo era un errore di
 * consuntivazione, 04/08/2026), il lavoro fatto non c'è mai stato: la riga chiusa non ha più
 * niente dietro, e senza questa lista la correzione andava rifatta a mano sul registro —
 * la doppia modifica che il modulo interventi doveva evitare.
 *
 * «NESSUN positivo» e non «l'intervento corretto»: su un'unità con più uscite (ripasso
 * negativo poi positivo) basta un positivo superstite a tenere la riga chiusa.
 */
export function idsDaRiaprire(
  chiusePositive: readonly string[],
  conclusi: readonly InterventoConcluso[],
): string[] {
  const positivi = new Set(
    conclusi.filter((c) => c.ordine_id && c.esito === 'eseguito_positivo').map((c) => c.ordine_id),
  );
  return chiusePositive.filter((id) => !positivi.has(id));
}

/**
 * Le righe «Aperta — non eseguita» da RIPORTARE ad «Aperta»: quelle il cui ordine non ha più
 * NESSUN intervento concluso, di nessun esito.
 *
 * Il marchio «non eseguita» racconta un'uscita a vuoto. Se quell'uscita viene azzerata,
 * annullata o cancellata dal modulo interventi, il racconto non ha più niente dietro — e
 * l'imbuto «da ripassare» terrebbe in coda una riga mai davvero visitata. Simmetrica di
 * `idsDaRiaprire`, che fa lo stesso servizio alle chiuse positive.
 */
export function idsSenzaConcluso(
  nonEseguite: readonly string[],
  conclusi: readonly InterventoConcluso[],
): string[] {
  const toccate = new Set(conclusi.filter((c) => c.ordine_id).map((c) => c.ordine_id));
  return nonEseguite.filter((id) => !toccate.has(id));
}

/**
 * Gli aggiornamenti da scrivere sul registro, raggruppati per (giorno, esito).
 *
 * Un `update` per gruppo e non per riga: i giorni di campagna sono pochi, le righe tante.
 *
 * L'ordine è DETERMINISTICO — per giorno crescente, e a parità di giorno secondo `RANGO` — così su
 * un'unità con più uscite l'ultima parola resta all'uscita più recente e, a parità di giorno, al
 * lavoro fatto. Non all'ordine in cui una `Map` capita di essere percorsa.
 */
export function gruppiChiusura(conclusi: readonly InterventoConcluso[]): GruppoChiusura[] {
  const gruppi = new Map<string, GruppoChiusura & { data: string | null }>();
  for (const c of conclusi) {
    if (!c.ordine_id) continue;
    const esito = esitoRiga(c);
    const k = `${c.data ?? ''}|${esito}`;
    const g = gruppi.get(k) ?? {
      esito,
      data: c.data,
      ids: [],
      patch: PATCH_PER_ESITO[esito](c.data),
    };
    g.ids.push(c.ordine_id);
    gruppi.set(k, g);
  }
  return [...gruppi.values()]
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')
      || RANGO[a.esito] - RANGO[b.esito])
    .map(({ esito, ids, patch }) => ({ esito, ids, patch }));
}
