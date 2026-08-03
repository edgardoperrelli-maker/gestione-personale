/*
  PURA: la dimensione COMMITTENTE della produzione economica.

  Fino a oggi il modulo era ACEA e basta: `COMMITTENTI = ['acea','lim_massive']` scritto due volte
  nei loader, e il filtro `committenteEff === 'acea'` sparso nei giri. Con AcquaLatina in produzione
  dal 29/07 quel «ACEA» implicito diventa una bugia — e la somma delle due commesse è proprio il
  numero che serve alla direzione.

  Qui vive UNA sola definizione di cosa sia una commessa e di cosa entri in ogni vista, così i due
  loader (pagina e candele) non possono più divergere in silenzio.
*/

/** Le commesse VALORIZZATE: hanno un listino e una produzione economica. */
export type Commessa = 'acea' | 'acqualatina';

/** Cosa guarda la pagina: una commessa sola, oppure la somma. */
export type VistaCommittente = 'tutti' | Commessa;

export const COMMESSE: readonly Commessa[] = ['acea', 'acqualatina'];
export const VISTE: readonly VistaCommittente[] = ['tutti', 'acea', 'acqualatina'];

export const ETICHETTA_VISTA: Record<VistaCommittente, string> = {
  tutti: 'Tutti',
  acea: 'ACEA',
  acqualatina: 'AcquaLatina',
};

/**
 * Come chiamare il lavoro di questa vista DENTRO una frase: «interventi ACEA assegnati»,
 * «interventi AcquaLatina assegnati», «interventi in commessa assegnati».
 *
 * Su «Tutti» il nome del committente non esiste — sono due — e «in commessa» è esattamente ciò
 * che le accomuna e che le distingue da italgas, che in questi conti non entra.
 */
export function etichettaCommessa(vista: VistaCommittente): string {
  return vista === 'tutti' ? 'in commessa' : ETICHETTA_VISTA[vista];
}

/*
  I valori GREZZI di `interventi.committente` da pescare per ogni commessa.

  Grezzi perché la riclassificazione la fa `attivitaCanonica` a valle (lim_massive→acea,
  gas acea→italgas): ma se la query non li tira su, a valle non ci arrivano mai. `lim_massive`
  è il committente delle limitazioni massive dei comuni con master (Labico, Zagarolo, …), che
  sono ACEA a tutti gli effetti economici.
*/
const GREZZI: Record<Commessa, readonly string[]> = {
  acea: ['acea', 'lim_massive'],
  acqualatina: ['acqualatina'],
};

/** Le commesse che una vista abbraccia. */
export function commesseDi(vista: VistaCommittente): readonly Commessa[] {
  return vista === 'tutti' ? COMMESSE : [vista];
}

/** I valori di `interventi.committente` da leggere per questa vista (per il `.in()` della query). */
export function committentiGrezzi(vista: VistaCommittente): string[] {
  return commesseDi(vista).flatMap((c) => [...GREZZI[c]]);
}

/**
 * La commessa in cui cade un committente EFFETTIVO (quello risolto dagli alias), o `null` se
 * quel lavoro è fuori dalla produzione economica — è il caso di `italgas`, che ha una sua
 * contabilità e che l'alias usa anche come discarica dei lavori ACEA non remunerati.
 */
export function commessaDi(committenteEff: string | null | undefined): Commessa | null {
  const c = (committenteEff ?? '').trim().toLowerCase();
  return c === 'acea' || c === 'acqualatina' ? c : null;
}

/** Quel committente effettivo entra in questa vista? */
export function inVista(vista: VistaCommittente, committenteEff: string | null | undefined): boolean {
  const c = commessaDi(committenteEff);
  return c != null && (vista === 'tutti' || vista === c);
}

/**
 * Il committente da usare per il LISTINO di una riga. Coincide con la commessa: due committenti
 * possono avere la stessa attività a prezzi diversi, quindi la tariffa non si cerca mai in un
 * listino unico — vedi `listinoPerCommessa` nei loader.
 */
export function listinoDi(committenteEff: string | null | undefined): Commessa | null {
  return commessaDi(committenteEff);
}

/**
 * La vista chiesta dal query param. Sconosciuto o assente → `tutti`.
 *
 * Il default è la SOMMA e non ACEA: un filtro che si apre già ristretto nasconde una commessa
 * a chi non sa che il filtro esista, ed è esattamente com'era la pagina prima — muta su
 * AcquaLatina. Meglio partire dal totale vero e lasciare che sia l'utente a restringere.
 */
export function vistaDaParam(raw: string | null | undefined): VistaCommittente {
  const v = (raw ?? '').trim().toLowerCase();
  return (VISTE as readonly string[]).includes(v) ? (v as VistaCommittente) : 'tutti';
}

/**
 * Il SAL, il pre-SAL, lo scarto e le discrepanze esistono SOLO per ACEA: nascono dal portale SAP
 * letto da Playwright e dai file SAL ufficiali, e AcquaLatina un portale non ce l'ha. Nella vista
 * «Tutti» quei numeri restano, ma vanno intestati alla sola contabilizzazione ACEA — nasconderli
 * andrebbe bene, farli passare per il consuntivo di tutte le commesse no.
 */
export function haContabilizzazione(vista: VistaCommittente): boolean {
  return vista !== 'acqualatina';
}
