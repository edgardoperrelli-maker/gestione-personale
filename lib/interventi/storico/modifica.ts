// lib/interventi/storico/modifica.ts
// PURE: helper per la modifica voce (admin_plus) e l'estrazione foto della consultazione storico.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import { campiConEsitoCorreggibile } from '@/utils/rapportini/opzioniEsito';
import { spezzaIndirizzo } from '@/lib/acqualatina/ordiniDaMaster';

/** Colonne anagrafiche editabili di `rapportino_voci` (whitelist). */
export const ANAGRAFICA_COLONNE = [
  'odl', 'via', 'comune', 'attivita', 'matricola', 'pdr', 'nominativo', 'cap', 'fascia_oraria',
] as const;
export type AnagraficaColonna = (typeof ANAGRAFICA_COLONNE)[number];
export type AnagraficaPatch = Partial<Record<AnagraficaColonna, string | null>>;

/** Mappa colonna anagrafica della voce → colonna corrispondente sull'intervento. */
const VOCE_TO_INTERVENTO: Record<AnagraficaColonna, string> = {
  odl: 'odl',
  via: 'indirizzo',
  comune: 'comune',
  attivita: 'intervento_tipo',
  matricola: 'matricola_contatore',
  pdr: 'pdr',
  nominativo: 'nominativo',
  cap: 'cap',
  fascia_oraria: 'fascia_oraria',
};

/** Etichette UI per le colonne anagrafiche. */
export const ANAGRAFICA_LABEL: Record<AnagraficaColonna, string> = {
  odl: 'ODL/ODS',
  via: 'Via',
  comune: 'Comune',
  attivita: 'Gruppo attività',
  matricola: 'Matricola',
  pdr: 'PDR',
  nominativo: 'Nominativo',
  cap: 'CAP',
  fascia_oraria: 'Fascia oraria',
};

/**
 * Campi editabili (non-foto) per la modale; garantisce un campo 'note' (testo) in coda.
 * Le select d'esito escono coi tre canonici sempre selezionabili (SI/NO/NESSUN PASSAGGIO,
 * vedi `campiConEsitoCorreggibile`): gli snapshot storici possono non averli tutti — solo
 * il positivo, o nati prima di «NESSUN PASSAGGIO» — e la correzione a posteriori li vuole tutti.
 */
export function buildCampiEditor(campiSnapshot: TemplateCampo[] | null | undefined): TemplateCampo[] {
  const base = campiConEsitoCorreggibile(
    (Array.isArray(campiSnapshot) ? campiSnapshot : [])
      .filter((c): c is TemplateCampo => Boolean(c) && c.tipo !== 'foto')
      .slice()
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)),
  );
  if (!base.some((c) => c.chiave === 'sigillo')) {
    base.push({ chiave: 'sigillo', etichetta: 'Sigillo', tipo: 'testo', ordine: 998 });
  }
  if (!base.some((c) => c.chiave === 'note')) {
    base.push({ chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 999 });
  }
  return base;
}

/** Path foto reali (rapportini/…) per i campi tipo='foto', con etichetta. */
export function estraiFotoPaths(
  risposte: Record<string, unknown> | null | undefined,
  campi: TemplateCampo[],
): { etichetta: string; path: string }[] {
  const r = risposte ?? {};
  const out: { etichetta: string; path: string }[] = [];
  for (const c of campi) {
    if (c.tipo !== 'foto') continue;
    for (const p of comeArrayFoto(r[c.chiave])) {
      if (p.startsWith('rapportini/')) out.push({ etichetta: c.etichetta, path: p });
    }
  }
  return out;
}

/**
 * MATRICOLA NUOVO MISURATORE obbligatoria (Sostituzione misuratori AcquaLatina) dai rapportini
 * generati da questo giorno in poi — migration `20260803160000_acqualatina_matricola_nuova`,
 * che l'ha aggiunta "ai rapportini generati DOPO" il 03/08 ore 16 (cioè da domani, il 04/08).
 *
 * Le voci di rapportini precedenti sono nate SENZA il campo, o senza l'obbligo: in correzione
 * (questa modale) pretenderlo bloccherebbe per sempre interventi che il gate non ha mai visto
 * nascere — l'esito resterebbe "neutro" a vita, mai chiuso, mai in riconciliazione AcquaLatina.
 * Invecchia da sola — fra qualche mese non filtra più niente e resta come traccia della data in
 * cui la regola è cambiata (stesso pattern di `NO_CHIUDE_DAL` in `chiusuraRegistro.ts`).
 */
export const MATRICOLA_NUOVA_OBBLIGATORIA_DAL = '2026-08-04';

/**
 * I campi da usare per calcolare la CHIUSURA di una voce in correzione: le matricole
 * obbligatorie si spengono per le voci di rapportini nati prima del gate (v. sopra). `null`
 * (data ignota, es. voce senza rapportino) conta come "prima": più prudente non bloccare un
 * caso che il gate non può nemmeno collocare nel tempo.
 */
export function campiPerChiusuraStorico(
  campi: TemplateCampo[],
  dataRapportino: string | null,
): TemplateCampo[] {
  if (dataRapportino !== null && dataRapportino >= MATRICOLA_NUOVA_OBBLIGATORIA_DAL) return campi;
  return campi.map((c) => (c.tipo === 'matricola' && c.obbligatoria ? { ...c, obbligatoria: false } : c));
}

/** Whitelist colonne anagrafiche: scarta chiavi ignote, trim, '' → null. */
export function anagraficaPatchValida(body: unknown): AnagraficaPatch {
  const out: AnagraficaPatch = {};
  if (!body || typeof body !== 'object') return out;
  const obj = body as Record<string, unknown>;
  for (const k of ANAGRAFICA_COLONNE) {
    if (!(k in obj)) continue;
    const v = obj[k];
    const s = v == null ? '' : String(v).trim();
    out[k] = s === '' ? null : s;
  }
  return out;
}

/** Traduce le colonne anagrafiche presenti in patch della tabella `interventi`. */
export function anagraficaPatchIntervento(p: AnagraficaPatch): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of ANAGRAFICA_COLONNE) {
    if (k in p) out[VOCE_TO_INTERVENTO[k]] = p[k] ?? null;
  }
  return out;
}

/**
 * La tabella del registro misuratori rimossi per QUESTO committente: ognuno ha la sua (AGENTS.md
 * §13, "registro gemello"). Chi aggiorna una riga di registro dallo storico (cambio esecutore)
 * non deve scrivere sempre su quella ACEA — su una voce AcquaLatina l'update non troverebbe
 * nessuna riga da correggere (0 righe non è un errore per un `.update().eq()`) e la riga gemella
 * resterebbe con esecutore/rapportino_id obsoleti, senza nessuna correzione successiva.
 */
export function tabellaMisuratori(committente: string | null | undefined): 'misuratori_rimossi' | 'acqualatina_misuratori_rimossi' {
  return committente === 'acqualatina' ? 'acqualatina_misuratori_rimossi' : 'misuratori_rimossi';
}

/** Cosa fare dell'intervento quando la sua voce viene cancellata dallo storico. */
export type EsitoInterventoCancellato = {
  /** `true` se l'intervento va eliminato insieme alla voce. */
  elimina: boolean;
  /** Spiegazione per l'ufficio quando l'intervento resta: perché, e chi lo tiene. */
  avviso?: string;
};

/**
 * Se l'intervento della voce cancellata muore con lei, o le sopravvive.
 *
 * La DELETE dello storico cancella voce + intervento collegato, e per la voce SOLA sul suo
 * intervento è la pulizia giusta. Ma un intervento può avere PIÙ voci addosso: succede ogni
 * volta che la pianificazione lo sposta da un operatore a un altro, perché
 * `sincronizzaRapportiniAcea` aggiunge la voce al rapportino nuovo senza togliere quella dal
 * vecchio — due voci, un intervento solo dietro tutt'e due.
 *
 * Cancellare l'intervento in quel caso è il danno peggiore che questa route possa fare, e non
 * in astratto: il 17/08/2026 la riga di PRATESI dell'ODL 12384609 è stata cancellata dallo
 * storico e si è portata via l'intervento di LIBERATORI, che quel lavoro l'aveva fatto. La FK
 * `on delete set null` ha orfanato la sua voce in silenzio, e da lì
 * `riconciliaChiusureAcqualatina` — che legge SOLO `interventi` — non ha più avuto niente da
 * chiudere: la riga di registro è tornata «APERTA» 17 secondi dopo, e nessuna riesecuzione
 * avrebbe potuto ripararla. Un lavoro fatto che il registro dichiarava da fare, per sempre.
 *
 * È la simmetrica della regola «voci mai orfane» (migration 20260810160000): là una voce non
 * resta senza il suo intervento, qui un intervento non sparisce da sotto le sue voci. Nel
 * dubbio si CONSERVA — un intervento di troppo si vede e si cancella, uno che manca no.
 *
 * `altreVoci` sono le voci che puntano ancora all'intervento DOPO la cancellazione di questa:
 * si contano dopo apposta, perché è quello lo stato che l'eliminazione lascerebbe dietro.
 */
export function esitoInterventoCancellato(
  interventoId: string | null | undefined,
  altreVoci: number,
): EsitoInterventoCancellato {
  if (!interventoId) return { elimina: false };
  if (altreVoci <= 0) return { elimina: true };
  return {
    elimina: false,
    avviso: altreVoci === 1
      ? 'Riga eliminata. L’intervento è stato conservato: un’altra voce di rapportino lo usa ancora (di norma lo stesso ODL rimasto anche sul giro di un altro operatore).'
      : `Riga eliminata. L’intervento è stato conservato: altre ${altreVoci} voci di rapportino lo usano ancora.`,
  };
}

/** Le colonne dell'anagrafica che convergono anche sul registro `acqualatina_ordini`. */
export type RegistroAnagraficaPatch = Partial<Record<
  'impianto' | 'nominativo' | 'via' | 'civico' | 'comune' | 'cap', string | null
>>;

/**
 * Traduce la correzione d'ufficio verso il registro AcquaLatina — PDR/impianto, nominativo,
 * indirizzo (spezzato in via+civico, come il registro lo tiene) e comune/cap. Restano FUORI,
 * apposta:
 *  - `odl`: è la CHIAVE del registro (odl, numero_operazione), non un campo anagrafico —
 *    propagarlo sposterebbe la correzione su una riga diversa, non la applicherebbe;
 *  - `matricola`: è l'IDENTITÀ della riga a registro (indice unico odl+matricola_norm).
 *    `ordiniDaMaster.ts` la esclude dalla sovrascrittura del sync per lo stesso motivo — «una
 *    matricola diversa non è una correzione, è un'altra riga» — e vale identico qui: la
 *    matricola del contatore rimosso, corretta su un intervento, non deve poter far «adottare»
 *    o confondere una riga di registro diversa;
 *  - `attivita`/`fascia_oraria`: classificazione dell'intervento, non anagrafica del punto.
 *
 * ⚠️ Un campo VUOTO non si propaga, e non è una raffinatezza: fino al 13/08/2026 il valore
 * partiva anche quando era `null`, così una correzione d'ufficio su un intervento che il PDR non
 * ce l'ha CANCELLAVA cod. fornitura e nome utente sull'ordine a registro. Le righe di
 * `acqualatina_ordini` senza quei due campi erano 16, tutte «CHIUSA — ESEGUITA», e cinque si sono
 * svuotate in venti minuti la mattina del 13/08 — una a ogni chiusura. L'intervento è la
 * fotografia di un'uscita e può legittimamente non avere l'anagrafica del punto; il registro è
 * l'anagrafica, e il silenzio dell'uno non è una smentita dell'altro.
 *
 * È la stessa regola che `patchAnagrafica` (`lib/acqualatina/ordiniDaMaster.ts`) applica nel verso
 * opposto — «un campo vuoto del file non cancella mai niente» — e ora i due versi concordano.
 * Corollario voluto: da qui un dato si CORREGGE, non si azzera. Per svuotarlo davvero si passa
 * dal registro.
 */
export function anagraficaPatchRegistro(p: AnagraficaPatch): RegistroAnagraficaPatch {
  const pieno = (v: string | null | undefined): v is string => String(v ?? '').trim() !== '';
  const patch: RegistroAnagraficaPatch = {};
  if ('pdr' in p && pieno(p.pdr)) patch.impianto = p.pdr;
  if ('nominativo' in p && pieno(p.nominativo)) patch.nominativo = p.nominativo;
  if ('comune' in p && pieno(p.comune)) patch.comune = p.comune;
  if ('cap' in p && pieno(p.cap)) patch.cap = p.cap;
  // L'indirizzo fa eccezione, ed è un'eccezione con una ragione: a registro `via` e `civico`
  // sono UN dato solo, spezzato per ordinare per civico numerico. Un indirizzo riscritto e non
  // vuoto è la coppia COMPLETA, quindi porta anche il civico assente — «VIA ROMA» dopo
  // «VIA ROMA 10» deve togliere il 10, o la correzione non si vedrebbe. Quello che non si
  // propaga è l'indirizzo SVUOTATO: lì non c'è nessuna coppia nuova da scrivere.
  if ('via' in p && pieno(p.via)) {
    const { via, civico } = spezzaIndirizzo(p.via);
    patch.via = via;
    patch.civico = civico;
  }
  return patch;
}
