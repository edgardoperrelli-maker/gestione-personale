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
};

/** Un intervento concluso SENZA il collegamento: `ordine_id` mai scritto. */
export type InterventoSciolto = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  data: string | null;
  esito: string | null;
};

/** La riga di registro come serve all'aggancio: identità e matricola normalizzata. */
export type RigaPerAggancio = {
  id: string;
  odl: string;
  matricola_norm: string | null;
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
 */
export function agganciPerOdl(
  sciolti: readonly InterventoSciolto[],
  righe: readonly RigaPerAggancio[],
): Array<{ interventoId: string; ordineId: string }> {
  const perOdl = new Map<string, RigaPerAggancio[]>();
  for (const r of righe) {
    const odl = r.odl.trim();
    if (odl === '') continue;
    perOdl.set(odl, [...(perOdl.get(odl) ?? []), r]);
  }
  const agganci: Array<{ interventoId: string; ordineId: string }> = [];
  for (const s of sciolti) {
    const candidate = perOdl.get(String(s.odl ?? '').trim()) ?? [];
    let scelta: RigaPerAggancio | null = candidate.length === 1 ? candidate[0] : null;
    if (!scelta && candidate.length > 1) {
      const m = normMatr(s.matricola_contatore);
      const stesse = m === '' ? [] : candidate.filter((c) => normMatr(c.matricola_norm) === m);
      if (stesse.length === 1) scelta = stesse[0];
    }
    if (scelta) agganci.push({ interventoId: s.id, ordineId: scelta.id });
  }
  return agganci;
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
  /** `true` se il gruppo porta l'esito POSITIVO: è l'unico che chiude la riga. */
  positivo: boolean;
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
export const STATO_APERTA = 'Aperta';

/** Riga chiusa col lavoro FATTO: l'unico stato definitivo della commessa. */
export const STATO_CHIUSA_ESEGUITA = 'Chiusa — eseguita';

/**
 * Riga ancora APERTA, con l'ultima uscita andata a vuoto.
 *
 * Il testo porta i due pezzi — com'è messa la riga e com'è finita l'uscita — perché l'imbuto della
 * colonna «Stato» filtra sul valore di `stato_desc` così com'è nel registro: è questa stringa a
 * dare all'ufficio la coda «da ripassare» in un clic, ed è il motivo per cui la vista AcquaLatina
 * non ricompone l'etichetta a schermo come fa con gli stati di ACEA.
 */
export const STATO_APERTA_NON_ESEGUITA = 'Aperta — non eseguita';

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
 * Gli aggiornamenti da scrivere sul registro, raggruppati per (giorno, esito).
 *
 * Un `update` per gruppo e non per riga: i giorni di campagna sono pochi, le righe tante.
 *
 * L'ordine è DETERMINISTICO — per giorno crescente, e a parità di giorno il negativo prima del
 * positivo — così su un'unità con più uscite l'ultima parola resta all'uscita più recente, e non
 * all'ordine in cui una `Map` capita di essere percorsa.
 */
export function gruppiChiusura(conclusi: readonly InterventoConcluso[]): GruppoChiusura[] {
  const gruppi = new Map<string, GruppoChiusura & { data: string | null }>();
  for (const c of conclusi) {
    if (!c.ordine_id) continue;
    const positivo = c.esito === 'eseguito_positivo';
    const k = `${c.data ?? ''}|${positivo}`;
    const g = gruppi.get(k) ?? {
      positivo,
      data: c.data,
      ids: [],
      patch: positivo ? PATCH_ESEGUITA(c.data) : PATCH_NON_ESEGUITA,
    };
    g.ids.push(c.ordine_id);
    gruppi.set(k, g);
  }
  return [...gruppi.values()]
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')
      || Number(a.positivo) - Number(b.positivo))
    .map(({ positivo, ids, patch }) => ({ positivo, ids, patch }));
}
