// lib/acea/giorniProgrammabili.ts
// PURA: quali giorni si possono programmare su ACEA, e come si chiamano a schermo.
//
// La regola viene dal campo, non da un calendario: si programma per OGGI e per il PROSSIMO GIORNO
// LAVORATIVO. La settimana lavorativa arriva **al sabato compreso**: da venerdì il giorno dopo è
// sabato, ed è solo dal sabato che si salta alla domenica per arrivare a lunedì.
//
// Il venerdì e il sabato però non sono giorni pieni PER IL DUNNING: ci si mandano **solo le
// attivazioni** — riaperture `RIAT`/`REVO`, quelle col cardine contrattuale a un giorno — e il
// resto del dunning aspetta il lunedì. Le limitazioni MASSIVE sono esenti (dec. 38): campagne per
// paese, si pianificano anche in quei giorni. `soloAttivazioni` resta una proprietà del GIORNO —
// per questo sta qui e non in un `if` sparso nelle rotte — e a decidere chi ne è toccato è
// `pianoPianificazione`, guardando la famiglia della riga.
//
// Perché una finestra e non un campo data libero: la pianificazione ACEA vale finché l'export del
// Cruscotto è fresco. Assegnare a tre settimane da oggi significa assegnare su uno stato degli
// ordini che nel frattempo è cambiato — e l'ordine, nel frattempo, può essere stato chiuso da
// qualcun altro. Il campo data libero non lo diceva: accettava qualunque giorno.

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

export type GiornoProgrammabile = {
  /** 'YYYY-MM-DD'. */
  data: string;
  /** «Oggi», «Domani», oppure il nome del giorno («Lunedì») quando salta la domenica. */
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

/** «lunedì 03/08» — giorno per esteso, senza anno: la finestra non esce mai dalla settimana. */
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
 * I giorni su cui si può programmare, dato «oggi» (in fuso Europe/Rome, deciso dal server).
 *
 * Sempre due: oggi e il prossimo giorno lavorativo. Elenco vuoto solo se «oggi» non è una data.
 */
export function giorniProgrammabili(oggi: string): GiornoProgrammabile[] {
  if (!eDataIso(oggi)) return [];
  const domani = isoDa(epoca(oggi) + GIORNO_MS);
  const secondo = prossimoLavorativo(oggi);
  const descrivi = (data: string, etichetta: string): GiornoProgrammabile => ({
    data, etichetta, esteso: giornoEsteso(data), soloAttivazioni: soloAttivazioni(data),
  });
  return [
    descrivi(oggi, 'Oggi'),
    // «Domani» solo quando è davvero il giorno dopo: dal sabato il secondo giorno è lunedì, e
    // chiamarlo «Domani» farebbe assegnare alla domenica credendo di assegnare al lunedì.
    descrivi(
      secondo,
      secondo === domani
        ? 'Domani'
        : NOMI_GIORNO[giornoSettimana(secondo)].replace(/^./, (c) => c.toUpperCase()),
    ),
  ];
}

/** `true` se quella data cade nella finestra programmabile. */
export function eProgrammabile(data: string, oggi: string): boolean {
  return giorniProgrammabili(oggi).some((g) => g.data === data);
}

/**
 * La finestra scritta in italiano, per i messaggi di rifiuto.
 *
 * «si programma solo per oggi (giovedì 30/07) o per lunedì 03/08»: dire quali sono i giorni buoni
 * costa una riga e risparmia il giro di tentativi che serve a scoprirli.
 */
export function spiegaFinestra(oggi: string): string {
  const giorni = giorniProgrammabili(oggi);
  if (giorni.length === 0) return 'si programma solo per oggi o per il giorno lavorativo successivo';
  return `si programma solo per ${giorni.map((g) => g.esteso).join(' o ')}`;
}

/** Il rifiuto di un ordine che non è un'attivazione su un giorno che ne accetta solo quelle. */
export const MOTIVO_SOLO_ATTIVAZIONI = 'solo attivazioni il venerdì e il sabato';
