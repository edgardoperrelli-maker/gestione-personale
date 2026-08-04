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

/** Le colonne di stato della riga di registro, riscritte in blocco. */
export type PatchRiga = {
  aperto: boolean;
  stato: string;
  stato_desc: string;
  esito_positivo: boolean;
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

/**
 * Riga CHIUSA senza che il lavoro sia stato fatto: l'esito `NO` della commessa.
 *
 * Su AcquaLatina il NO è definitivo — il contatore non c'è più, l'impianto è dismesso, l'utente
 * rifiuta — quindi non c'è niente da ripianificare e tenere la riga in coda è rumore. È lo stato
 * che mancava: prima una riga o era fatta, o era ancora da fare.
 */
export const STATO_CHIUSA_NON_ESEGUITA = 'Chiusa — non eseguita';

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
