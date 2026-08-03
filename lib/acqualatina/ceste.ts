/*
  PURA: le ceste di magazzino della commessa AcquaLatina.

  Il contatore smontato in campo la sera si scarica in una CESTA numerata; quando la cesta si
  riempie finisce su un PALLET, che è il riferimento con cui la riconsegna al committente
  viaggia. Questo file è il primo dei due passi: chi decide cosa va scaricato adesso, e quali
  numeri di cesta sono selezionabili.

  Niente DB e niente React: sono le tre decisioni che devono restare vere anche quando la
  modale dell'operatore verrà riscritta.
*/

/** L'intervallo delle ceste in magazzino. Entrambi nulli = non configurato (campo libero). */
export type ConfigCeste = { numeroMin: number | null; numeroMax: number | null };

/** Il minimo che serve per partizionare: il resto della riga viaggia col generico. */
export type RigaDaScaricare = { data_esecuzione: string; matricola: string };

/**
 * Un misuratore in attesa di scarico, come lo vede l'operatore.
 *
 * Vive qui e non nello strato server perché lo legge anche la modale, che è un client
 * component: importarlo da un modulo `server-only` trascinerebbe il server nel bundle.
 */
export type MisuratoreDaScaricare = RigaDaScaricare & {
  id: string;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
};

/**
 * Oltre questa ampiezza l'intervallo non diventa un menu.
 *
 * Un refuso in configurazione («da 1 a 100000») produrrebbe una tendina che sul telefono non si
 * scorre: meglio ricadere sul campo libero, che funziona sempre, che offrire un comando
 * inutilizzabile.
 */
const MAX_VOCI_MENU = 500;

/**
 * I misuratori ancora da scaricare, divisi in quelli del giorno e negli arretrati.
 *
 * Il flowchart dice «di oggi e di ieri»; la regola vera, che lo comprende, è «tutto quello che
 * il registro ha ancora come da consegnare». Se l'operatore risponde «no» per tre sere di
 * fila, alla quarta se li ritrova tutti — «ieri» non è un limite, è il caso normale.
 *
 * La soglia è `>=` e non `===`: le due liste devono COPRIRE l'ingresso. Una data futura non
 * dovrebbe esistere, ma se esiste deve comparire da qualche parte — una riga che sparisce
 * dalla modale è un contatore che nessuno scarica mai.
 */
export function partizionaDaScaricare<T extends RigaDaScaricare>(
  righe: readonly T[],
  dataOggi: string,
): { oggi: T[]; arretrati: T[] } {
  // Data decrescente, poi matricola: due aperture della modale mostrano lo stesso ordine.
  const ordina = (a: T, b: T) =>
    a.data_esecuzione === b.data_esecuzione
      ? a.matricola.localeCompare(b.matricola, 'it', { numeric: true })
      : b.data_esecuzione.localeCompare(a.data_esecuzione);

  return {
    oggi: righe.filter((r) => r.data_esecuzione >= dataOggi).sort(ordina),
    arretrati: righe.filter((r) => r.data_esecuzione < dataOggi).sort(ordina),
  };
}

/**
 * I numeri di cesta selezionabili. Array vuoto = nessun menu, il campo resta libero.
 *
 * Stringhe e non numeri: il valore finisce in una colonna `text` (la cesta è un riferimento,
 * non una quantità) e il menu deve parlare la stessa lingua di quello che si salva.
 */
export function numeriCesta(config: ConfigCeste): string[] {
  const { numeroMin, numeroMax } = config;
  if (numeroMin === null || numeroMax === null) return [];
  if (numeroMax - numeroMin + 1 > MAX_VOCI_MENU) return [];
  return Array.from({ length: numeroMax - numeroMin + 1 }, (_, i) => String(numeroMin + i));
}

/**
 * Il valore scritto è una cesta accettabile?
 *
 * `ok` è falso SOLO sul vuoto: fuori intervallo si avvisa e si passa. Se il magazzino aggiunge
 * una cesta prima che l'ufficio aggiorni la configurazione, la realtà vince sul nostro campo —
 * un blocco costringerebbe l'operatore a scrivere un numero falso pur di chiudere.
 */
export function validaCesta(valore: string, config: ConfigCeste): { ok: boolean; fuoriIntervallo: boolean } {
  const pulito = valore.trim();
  if (pulito === '') return { ok: false, fuoriIntervallo: false };
  const { numeroMin, numeroMax } = config;
  if (numeroMin === null || numeroMax === null) return { ok: true, fuoriIntervallo: false };
  const n = /^\d+$/.test(pulito) ? Number(pulito) : null;
  return { ok: true, fuoriIntervallo: n === null || n < numeroMin || n > numeroMax };
}

/** Intero >= 1, o `null`. PostgREST può restituire i numeri come stringhe. */
function intero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 ? v : null;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    return n >= 1 ? n : null;
  }
  return null;
}

/**
 * La riga di configurazione → `ConfigCeste`.
 *
 * Un solo estremo valorizzato vale come NON configurato: non descrive un intervallo, e lasciare
 * che la UI indovini l'altro estremo è il modo di far comparire un menu che nessuno ha chiesto.
 * Il CHECK del DB già lo vieta; la lettura non si fida lo stesso, perché una riga scritta a mano
 * in console costa meno di un deploy.
 */
export function normalizzaConfig(riga: { numero_min?: unknown; numero_max?: unknown } | null | undefined): ConfigCeste {
  const vuoto: ConfigCeste = { numeroMin: null, numeroMax: null };
  if (!riga) return vuoto;
  const min = intero(riga.numero_min);
  const max = intero(riga.numero_max);
  if (min === null || max === null || max < min) return vuoto;
  return { numeroMin: min, numeroMax: max };
}
