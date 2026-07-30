// lib/acea/layoutTabella.ts
// PURA: come l'utente ha sistemato le colonne — ordine e larghezze — e come si rilegge dal disco.
//
// È la parte che, sbagliata, fa SPARIRE una colonna senza dirlo. Il caso che conta non è il
// trascinamento (quello si vede subito se non funziona): è il giorno in cui al codice si aggiunge
// una colonna nuova e in giro ci sono layout salvati che non la conoscono. Se l'ordine salvato
// facesse da elenco autorevole, quella colonna non comparirebbe più a nessuno di quegli utenti, e
// nessuno collegherebbe la cosa al proprio trascinamento di sei mesi prima.
//
// Quindi la fonte di verità di COSA esiste resta sempre la definizione nel codice. Il layout
// salvato dice solo DOVE va e QUANTO è larga ciò che esiste già.

/** Larghezze ammesse: sotto non si legge l'intestazione, sopra si perde il resto della tabella. */
export const LARGHEZZA_MIN = 56;
export const LARGHEZZA_MAX = 640;

export type LayoutTabella = {
  /** Chiavi nell'ordine scelto. Vuoto = ordine di definizione. */
  ordine: string[];
  /** Larghezza scelta per chiave. Assente = la base della colonna, che resta elastica. */
  larghezze: Record<string, number>;
};

export const LAYOUT_VUOTO: LayoutTabella = { ordine: [], larghezze: {} };

/** Chiave di memorizzazione. Separata per famiglia: le due viste hanno colonne diverse. */
export const chiaveLayout = (famiglia: string) => `acea:layout-tabella:${famiglia}`;

export function limitaLarghezza(n: number): number {
  if (!Number.isFinite(n)) return LARGHEZZA_MIN;
  return Math.round(Math.min(Math.max(n, LARGHEZZA_MIN), LARGHEZZA_MAX));
}

/**
 * Rilegge un layout salvato, tenendo solo ciò che ha ancora senso.
 *
 * Difensiva per principio: quella stringa vive nel browser dell'utente, sopravvive ai rilasci e
 * può contenere il layout di una versione di sei mesi fa, o niente del tutto. Chiavi che non
 * esistono più, larghezze fuori scala, JSON rotto — tutto viene scartato in silenzio, perché
 * l'alternativa è una tabella che non si disegna.
 */
export function leggiLayout(grezzo: string | null, chiaviValide: ReadonlySet<string>): LayoutTabella {
  if (!grezzo) return LAYOUT_VUOTO;
  let dati: unknown;
  try {
    dati = JSON.parse(grezzo);
  } catch {
    return LAYOUT_VUOTO;
  }
  if (typeof dati !== 'object' || dati === null) return LAYOUT_VUOTO;
  const o = dati as { ordine?: unknown; larghezze?: unknown };

  const visti = new Set<string>();
  const ordine: string[] = [];
  if (Array.isArray(o.ordine)) {
    for (const k of o.ordine) {
      if (typeof k === 'string' && chiaviValide.has(k) && !visti.has(k)) {
        visti.add(k);
        ordine.push(k);
      }
    }
  }

  const larghezze: Record<string, number> = {};
  if (typeof o.larghezze === 'object' && o.larghezze !== null) {
    for (const [k, v] of Object.entries(o.larghezze as Record<string, unknown>)) {
      if (!chiaviValide.has(k)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      larghezze[k] = limitaLarghezza(v);
    }
  }

  return { ordine, larghezze };
}

export const scriviLayout = (l: LayoutTabella): string => JSON.stringify(l);

/**
 * Le colonne nell'ordine scelto dall'utente.
 *
 * `colonne` è la fonte di verità di cosa esiste; `ordine` dice solo dove va ciò che esiste. Una
 * colonna aggiunta al codice dopo il salvataggio entra DOPO quella che la precede di default, non
 * in fondo: in fondo finirebbe fuori dalla parte di tabella che si guarda, e per chi ha un layout
 * salvato equivarrebbe a non averla aggiunta.
 */
export function ordinaColonne<T extends { chiave: string }>(colonne: T[], ordine: string[]): T[] {
  if (ordine.length === 0) return colonne;
  const perChiave = new Map(colonne.map((c) => [c.chiave, c]));
  const messe = new Set<string>();
  const risultato: T[] = [];

  for (const k of ordine) {
    const c = perChiave.get(k);
    if (c && !messe.has(k)) {
      risultato.push(c);
      messe.add(k);
    }
  }

  for (let i = 0; i < colonne.length; i++) {
    const c = colonne[i];
    if (messe.has(c.chiave)) continue;
    let at: number;
    if (i === 0) {
      at = 0;
    } else {
      const j = risultato.findIndex((x) => x.chiave === colonne[i - 1].chiave);
      at = j >= 0 ? j + 1 : risultato.length;
    }
    risultato.splice(at, 0, c);
    messe.add(c.chiave);
  }

  return risultato;
}

/**
 * Sposta `da` nella posizione di `a`.
 *
 * `ordine` è quello EFFETTIVO a schermo (già passato da `ordinaColonne`), non quello salvato: così
 * il primo trascinamento funziona anche quando non è ancora stato salvato niente, invece di
 * lavorare su una lista vuota e non spostare nulla.
 */
export function spostaColonna(ordine: string[], da: string, a: string): string[] {
  if (da === a) return ordine;
  const iDa = ordine.indexOf(da);
  const iA = ordine.indexOf(a);
  if (iDa < 0 || iA < 0) return ordine;
  const agg = [...ordine];
  agg.splice(iDa, 1);
  agg.splice(iA, 0, da);
  return agg;
}

/** Sposta di un posto a sinistra (−1) o a destra (+1). Ai bordi non fa niente. */
export function spostaDi(ordine: string[], chiave: string, passo: -1 | 1): string[] {
  const i = ordine.indexOf(chiave);
  if (i < 0) return ordine;
  const j = i + passo;
  if (j < 0 || j >= ordine.length) return ordine;
  return spostaColonna(ordine, chiave, ordine[j]);
}
