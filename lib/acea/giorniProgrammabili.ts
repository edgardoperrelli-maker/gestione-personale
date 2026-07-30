// lib/acea/giorniProgrammabili.ts
// PURA: quali giorni si possono programmare su ACEA, e come si chiamano a schermo.
//
// La regola viene dal campo, non da un calendario: si programma per OGGI e per il PROSSIMO GIORNO
// LAVORATIVO. Di venerdì il prossimo giorno lavorativo è lunedì, quindi la finestra è
// venerdì + lunedì; il sabato e la domenica restano programmabili come "oggi" (chi lavora nel
// weekend deve poter vedere le sue righe) ma il secondo giorno resta comunque il lunedì.
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

export type GiornoProgrammabile = {
  /** 'YYYY-MM-DD'. */
  data: string;
  /** «Oggi», «Domani», oppure il nome del giorno («Lunedì») quando salta il weekend. */
  etichetta: string;
  /** Forma lunga per titoli e messaggi di rifiuto: «lunedì 03/08». */
  esteso: string;
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

/** Il primo giorno feriale DOPO quello dato: da venerdì, sabato e domenica esce sempre lunedì. */
export function prossimoFeriale(iso: string): string {
  let ms = epoca(iso) + GIORNO_MS;
  // Al massimo tre passi (venerdì → lunedì); il ciclo è comunque limitato per non poter divergere.
  for (let i = 0; i < 7; i++) {
    const g = new Date(ms).getUTCDay();
    if (g >= 1 && g <= 5) break;
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
  const secondo = prossimoFeriale(oggi);
  return [
    { data: oggi, etichetta: 'Oggi', esteso: giornoEsteso(oggi) },
    {
      data: secondo,
      // «Domani» solo quando è davvero il giorno dopo: da venerdì il secondo giorno è lunedì, e
      // chiamarlo «Domani» farebbe assegnare al sabato credendo di assegnare al lunedì.
      etichetta: secondo === domani
        ? 'Domani'
        : NOMI_GIORNO[giornoSettimana(secondo)].replace(/^./, (c) => c.toUpperCase()),
      esteso: giornoEsteso(secondo),
    },
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
