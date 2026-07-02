// Riga di dettaglio per l'export "Interventi non classificati" della Produzione economica ACEA.
// A differenza di RigaProduzione (aggregaProduzione.ts) porta il testo GREZZO dell'attività: quando
// canon viene da un alias, attivitaLabel è l'etichetta CANONICA condivisa da più testi grezzi diversi
// (es. più causali tutte mappate su "Riattivazione utenza" ma mai assegnate a una voce KPI) — per
// riclassificare serve vedere cosa l'operatore ha scritto davvero, non solo il bucket in cui è finito.
export interface InterventoNonClassificato {
  odl: string;
  data: string;
  operatore: string;
  territorio: string;
  committente: string;
  comune: string;
  descrizioneGrezza: string; // interventi.intervento_tipo così come inserito
  attivitaCanonica: string; // etichetta risolta (alias o fallback) attualmente assegnata
  valore: number;
}
