// lib/acea/giorniProgrammabili.ts
// PURA: fin dove si può programmare su ACEA, e come si chiamano a schermo i giorni.
//
// La finestra è un INTERVALLO: da OGGI fino a due settimane avanti, domenica esclusa. Erano due
// giorni soli — oggi e il prossimo lavorativo — e dal venerdì il LUNEDÌ non si poteva programmare
// affatto: proprio il giorno in cui il dunning riparte pieno, dato che venerdì e sabato passano
// solo le attivazioni. Il lavoro del lunedì si prepara il venerdì, e il menu di due voci
// costringeva ad aspettare il lunedì mattina per assegnarlo (dec. 49).
//
// Il tetto resta, perché la ragione di averlo non è cambiata: la pianificazione ACEA vale finché
// l'export del Cruscotto è fresco, e assegnare a un mese da oggi significa assegnare su uno stato
// degli ordini che nel frattempo è cambiato — l'ordine, intanto, può essere stato chiuso da
// qualcun altro. Due settimane sono la scadenza standard del dunning (creazione + 14 gg): oltre
// quella, l'ordine è comunque fuori tempo.
//
// La settimana lavorativa arriva **al sabato compreso**: da venerdì il giorno dopo è sabato, ed è
// solo dal sabato che si salta alla domenica per arrivare a lunedì.
//
// Il venerdì e il sabato però non sono giorni pieni PER IL DUNNING: ci si mandano **solo le
// attivazioni** — riaperture `RIAT`/`REVO`, quelle col cardine contrattuale a un giorno — e il
// resto del dunning aspetta il lunedì. Le limitazioni MASSIVE sono esenti (dec. 38): campagne per
// paese, si pianificano anche in quei giorni. `soloAttivazioni` resta una proprietà del GIORNO —
// per questo sta qui e non in un `if` sparso nelle rotte — e a decidere chi ne è toccato è
// `pianoPianificazione`, guardando la famiglia della riga.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GIORNO_MS = 86_400_000;

/** Nomi in italiano indicizzati come `getUTCDay()`: 0 = domenica. */
const NOMI_GIORNO = [
  'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
] as const;

/** Giorni in cui si lavora, come `getUTCDay()`: lunedì (1) → sabato (6). */
const LAVORATIVI = new Set([1, 2, 3, 4, 5, 6]);
/** Giorni riservati alle sole attivazioni: venerdì (5) e sabato (6). */
const SOLO_ATTIVAZIONI = new Set([5, 6]);

/**
 * Quanti giorni avanti si può programmare, oltre a oggi.
 *
 * Due settimane: la scadenza standard del dunning (creazione + 14 gg). Oltre, l'ordine è fuori
 * tempo comunque, e la fotografia del Cruscotto su cui si sta decidendo è vecchia.
 */
export const ORIZZONTE_GIORNI = 14;

export type GiornoProgrammabile = {
  /** 'YYYY-MM-DD'. */
  data: string;
  /** «Oggi», «Domani», oppure il nome del giorno («Lunedì») per tutti gli altri. */
  etichetta: string;
  /** Forma lunga per titoli e messaggi di rifiuto: «lunedì 03/08». */
  esteso: string;
  /** `true` di venerdì e di sabato: il dunning ci programma solo riaperture (`RIAT`/`REVO`); le massive sono esenti. */
  soloAttivazioni: boolean;
};

const epoca = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoDa = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `true` se la stringa è una data ISO che esiste davvero (il 31/02 non passa). */
export function eDataIso(v: string): boolean {
  if (!ISO.test(v)) return false;
  const ms = epoca(v);
  return Number.isFinite(ms) && isoDa(ms) === v;
}

/** 0 = domenica … 6 = sabato, come `getUTCDay`. */
function giornoSettimana(iso: string): number {
  return new Date(epoca(iso)).getUTCDay();
}

/** «lunedì 03/08» — giorno per esteso, senza anno: la finestra è di due settimane, l'anno è uno. */
export function giornoEsteso(iso: string): string {
  if (!eDataIso(iso)) return iso;
  const [, mese, giorno] = iso.split('-');
  return `${NOMI_GIORNO[giornoSettimana(iso)]} ${giorno}/${mese}`;
}

/**
 * `true` se in quel giorno il DUNNING programma SOLO attivazioni (riaperture `RIAT`/`REVO`).
 *
 * Venerdì e sabato. Non è una regola di calendario ma di commessa: le riaperture hanno un giorno
 * di cardine contrattuale e non possono aspettare il lunedì, il resto del dunning sì. Le
 * limitazioni massive sono ESENTI: chi applica la regola (`pianoPianificazione`) le fa passare.
 */
export function soloAttivazioni(iso: string): boolean {
  return eDataIso(iso) && SOLO_ATTIVAZIONI.has(giornoSettimana(iso));
}

/** Il primo giorno lavorativo DOPO quello dato. Solo la domenica non è lavorativa. */
export function prossimoLavorativo(iso: string): string {
  let ms = epoca(iso) + GIORNO_MS;
  // Un passo solo (sabato → lunedì); il ciclo è comunque limitato per non poter divergere.
  for (let i = 0; i < 7; i++) {
    if (LAVORATIVI.has(new Date(ms).getUTCDay())) break;
    ms += GIORNO_MS;
  }
  return isoDa(ms);
}

/**
 * Come si chiama un giorno rispetto a oggi: «Oggi», «Domani», o il suo nome («Lunedì»).
 *
 * «Domani» solo quando è davvero il giorno dopo: chiamare così il lunedì visto dal sabato farebbe
 * assegnare alla domenica credendo di assegnare al lunedì.
 */
export function etichettaGiorno(data: string, oggi: string): string {
  if (!eDataIso(data)) return data;
  if (data === oggi) return 'Oggi';
  if (eDataIso(oggi) && data === isoDa(epoca(oggi) + GIORNO_MS)) return 'Domani';
  return NOMI_GIORNO[giornoSettimana(data)].replace(/^./, (c) => c.toUpperCase());
}

/** Un giorno con tutto quello che serve a mostrarlo: etichetta, forma lunga, regola del giorno. */
export function descriviGiorno(data: string, oggi: string): GiornoProgrammabile {
  return {
    data,
    etichetta: etichettaGiorno(data, oggi),
    esteso: giornoEsteso(data),
    soloAttivazioni: soloAttivazioni(data),
  };
}

/**
 * Gli estremi della finestra, per `min`/`max` di un campo data: da oggi a oggi + orizzonte.
 *
 * `null` se «oggi» non è una data: meglio un calendario senza limiti — la validazione rifiuta
 * comunque — che uno con limiti calcolati sul niente.
 */
export function limitiFinestra(oggi: string): { min: string; max: string } | null {
  if (!eDataIso(oggi)) return null;
  return { min: oggi, max: isoDa(epoca(oggi) + ORIZZONTE_GIORNI * GIORNO_MS) };
}

/**
 * I giorni PRONTI in elenco: oggi e il prossimo giorno lavorativo.
 *
 * Non sono più tutta la finestra — quella è un intervallo di due settimane — ma le due voci che
 * coprono il grosso della giornata di chi programma, e le sole per cui vale la pena leggere il
 * cronoprogramma in anticipo (`finestraProgrammabile`). Gli altri giorni si scelgono dal campo
 * data e il loro tabellone si chiede quando servono.
 */
export function giorniRapidi(oggi: string): GiornoProgrammabile[] {
  if (!eDataIso(oggi)) return [];
  return [descriviGiorno(oggi, oggi), descriviGiorno(prossimoLavorativo(oggi), oggi)];
}

/**
 * `true` se quella data cade nella finestra programmabile: da oggi a oggi + `ORIZZONTE_GIORNI`.
 *
 * Il passato no — si programma il lavoro che deve ancora essere fatto — e la domenica nemmeno,
 * perché non si lavora. Con un'eccezione: «oggi», qualunque giorno sia. Chi apre il registro di
 * domenica per il lavoro del giorno stesso non deve trovare la porta chiusa.
 */
export function eProgrammabile(data: string, oggi: string): boolean {
  const limiti = limitiFinestra(oggi);
  if (!limiti || !eDataIso(data)) return false;
  if (data < limiti.min || data > limiti.max) return false;
  return data === oggi || LAVORATIVI.has(giornoSettimana(data));
}

/**
 * La finestra scritta in italiano, per i messaggi di rifiuto.
 *
 * «si programma da venerdì 31/07 a venerdì 14/08, domenica esclusa»: dire dove finisce la finestra
 * costa una riga e risparmia il giro di tentativi che serve a scoprirlo.
 */
export function spiegaFinestra(oggi: string): string {
  const limiti = limitiFinestra(oggi);
  if (!limiti) return `si programma da oggi ai ${ORIZZONTE_GIORNI} giorni successivi, domenica esclusa`;
  return `si programma da ${giornoEsteso(limiti.min)} a ${giornoEsteso(limiti.max)}, domenica esclusa`;
}

/** Il rifiuto di un ordine che non è un'attivazione su un giorno che ne accetta solo quelle. */
export const MOTIVO_SOLO_ATTIVAZIONI = 'solo attivazioni il venerdì e il sabato';
