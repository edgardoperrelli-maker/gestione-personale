// lib/acea/anagraficaCelle.ts
// PURA: le colonne ANAGRAFICHE del registro commesse (ACEA e AcquaLatina), e dove finisce una
// loro correzione fatta in griglia.
//
// L'anagrafica del PUNTO — indirizzo, comune, CAP, cod. fornitura/impianto, nome utente,
// recapito — vive in TRE copie: la riga di registro (`acea_ordini` / `acqualatina_ordini`),
// l'intervento agganciato e la voce di rapportino che l'operatore ha in mano. Le due direzioni
// esistevano già: il sync dal master la scrive sul registro e la fa scendere (migration
// 20260802140000), la correzione d'ufficio dallo Storico interventi risale verso il registro
// (`lib/interventi/storico/modifica.ts` + `lib/acqualatina/propagaAnagrafica.ts`). Mancava la
// terza porta, che è quella da cui l'ufficio guarda la commessa tutti i giorni: la GRIGLIA.
// Questo modulo è la stessa mappa vista da lì.
//
// COSA RESTA FUORI, e non è una dimenticanza:
//  - `odl` e `numero_operazione` sono la CHIAVE della riga: cambiarli non correggerebbe questa
//    riga, ne colpirebbe un'altra (o nessuna);
//  - `matricola` è l'IDENTITÀ della riga a registro — indice unico `(odl, matricola_norm)` — e
//    vale la frase già scritta due volte altrove (`ordiniDaMaster`, `anagraficaPatchRegistro`):
//    «una matricola diversa non è una correzione, è un'altra riga». Un contatore sbagliato si
//    risolve dal master del committente, non riscrivendo l'identità di una riga viva;
//  - `coordinate`: è una coppia di decimali che arriva da un file suo (Strumenti → Coordinate
//    dei punti), non un dato che si detta al telefono.
//
// ⚠️ LA CORREZIONE NON È DEFINITIVA, ed è bene saperlo prima di farla: il registro ACEA è lo
// specchio dell'export del Cruscotto e quello AcquaLatina del master del committente, e
// ENTRAMBI gli import sono correttivi sull'anagrafica (`riconciliaImport`, `patchAnagrafica`).
// Un file successivo che porta un valore diverso rimette il suo. Qui si corregge quello che il
// committente ha mandato storto per farlo arrivare giusto all'operatore OGGI, non si riscrive
// la fonte.

import { spezzaIndirizzo } from '@/lib/acqualatina/ordiniDaMaster';
import { testoPulito } from '@/lib/testo/maiuscolo';

/**
 * Le colonne della tabella che sono anagrafica del punto, cioè le sole correggibili in cella
 * oltre alle nostre (esecutore, giorno, note, matricola nuova).
 *
 * Sono chiavi di `ChiaveColonna` (vedi `colonneTabella.ts`): `indirizzo` è la colonna composta
 * via + civico, non una colonna del database — lo spacco lo fa `patchRegistro` qui sotto.
 */
export const COLONNE_ANAGRAFICA = [
  'indirizzo', 'comune', 'cap', 'impianto', 'nominativo', 'recapito',
] as const;

export type ColonnaAnagrafica = (typeof COLONNE_ANAGRAFICA)[number];

/** Patch anagrafica di UNA riga: solo le colonne toccate; `null` = svuotata. */
export type AnagraficaCelle = Partial<Record<ColonnaAnagrafica, string | null>>;

export function eColonnaAnagrafica(chiave: string): chiave is ColonnaAnagrafica {
  return (COLONNE_ANAGRAFICA as readonly string[]).includes(chiave);
}

/**
 * Quanto può essere lungo il valore di una cella, colonna per colonna.
 *
 * Non è validazione di dominio (un CAP di quattro cifre resta scrivibile: gli export del
 * committente ne portano di storti, e rifiutarli qui vorrebbe dire non poterli correggere):
 * è la stessa difesa di `MAX_NOTA` — impedire che un incolla sbagliato infili mezzo documento
 * in una cella che poi finisce sulla card dell'operatore.
 */
export const MAX_ANAGRAFICA: Record<ColonnaAnagrafica, number> = {
  indirizzo: 200,
  comune: 80,
  cap: 10,
  impianto: 60,
  nominativo: 160,
  recapito: 60,
};

/**
 * Il valore come va scritto: taglio alla lunghezza massima, poi `testoPulito` — MAIUSCOLO,
 * spazi doppi schiacciati, vuoto → `null`.
 *
 * Il MAIUSCOLO non è una scelta di questo modulo, è la convenzione «DB pulito» della casa
 * (`lib/testo/maiuscolo.ts`) e la stessa forma in cui l'import scrive queste colonne: senza,
 * un «Latina» digitato a mano diventerebbe una VOCE IN PIÙ nell'imbuto del Comune accanto a
 * «LATINA», e il filtro per paese — che è come si pianificano le massive — comincerebbe a
 * perdere righe senza che nessuno se ne accorga.
 *
 * Vale sia sul client (il valore ottimistico in cella dev'essere quello che il server scriverà)
 * sia sul server (che non si fida di quello che gli arriva): è il motivo per cui sta qui.
 */
export function valoreAnagrafica(colonna: ColonnaAnagrafica, v: unknown): string | null {
  const grezzo = typeof v === 'string' ? v : v == null ? '' : String(v);
  return testoPulito(grezzo.slice(0, MAX_ANAGRAFICA[colonna]));
}

/** Whitelist della patch che arriva dal client: scarta le chiavi ignote e normalizza il resto. */
export function anagraficaCelleValida(body: unknown): AnagraficaCelle {
  const out: AnagraficaCelle = {};
  if (!body || typeof body !== 'object') return out;
  const obj = body as Record<string, unknown>;
  for (const k of COLONNE_ANAGRAFICA) {
    if (!(k in obj)) continue;
    out[k] = valoreAnagrafica(k, obj[k]);
  }
  return out;
}

/**
 * La patch per la riga di REGISTRO (`acea_ordini` / `acqualatina_ordini`).
 *
 * L'unico campo che non va uno-a-uno è l'indirizzo: a registro vive spezzato in `via` +
 * `civico` perché l'ordinamento canonico della vista è via + civico NUMERICO (`civico_num` è
 * generata dal civico). Si usa lo stesso spacco del sync dal master — una sola regola, o due
 * strade di scrittura ordinerebbero la stessa strada in due modi.
 */
export function patchRegistroAnagrafica(a: AnagraficaCelle): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if ('comune' in a) patch.comune = a.comune ?? null;
  if ('cap' in a) patch.cap = a.cap ?? null;
  if ('impianto' in a) patch.impianto = a.impianto ?? null;
  if ('nominativo' in a) patch.nominativo = a.nominativo ?? null;
  if ('recapito' in a) patch.recapito = a.recapito ?? null;
  if ('indirizzo' in a) {
    const { via, civico } = spezzaIndirizzo(a.indirizzo);
    patch.via = via;
    patch.civico = civico;
  }
  return patch;
}

/**
 * La patch per l'INTERVENTO agganciato: la stessa mappa di `VOCE_TO_INTERVENTO` (lo Storico),
 * percorsa nell'altro verso. Due nomi diversi per lo stesso dato: `impianto` a registro è
 * `pdr` sull'intervento, e l'indirizzo torna intero (là non c'è nessun civico da ordinare).
 */
export function patchInterventoAnagrafica(a: AnagraficaCelle): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if ('indirizzo' in a) patch.indirizzo = a.indirizzo ?? null;
  if ('comune' in a) patch.comune = a.comune ?? null;
  if ('cap' in a) patch.cap = a.cap ?? null;
  if ('impianto' in a) patch.pdr = a.impianto ?? null;
  if ('nominativo' in a) patch.nominativo = a.nominativo ?? null;
  if ('recapito' in a) patch.recapito = a.recapito ?? null;
  return patch;
}

/**
 * La patch per la VOCE di rapportino — l'ultimo anello, quello che l'operatore legge.
 *
 * Fermarsi all'intervento non basterebbe: la voce nasce da lui e poi vive per conto suo (è la
 * lezione già scritta nella migration 20260802140000, §7), quindi il rapportino di domani
 * porterebbe ancora l'indirizzo sbagliato che si è appena corretto. Sulla voce l'indirizzo
 * intero sta in `via`, come dichiara `VOCE_TO_INTERVENTO`.
 */
export function patchVoceAnagrafica(a: AnagraficaCelle): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if ('indirizzo' in a) patch.via = a.indirizzo ?? null;
  if ('comune' in a) patch.comune = a.comune ?? null;
  if ('cap' in a) patch.cap = a.cap ?? null;
  if ('impianto' in a) patch.pdr = a.impianto ?? null;
  if ('nominativo' in a) patch.nominativo = a.nominativo ?? null;
  if ('recapito' in a) patch.recapito = a.recapito ?? null;
  return patch;
}
