// lib/acea/exportVista.ts
// PURA: quanto scaricare per esportare la vista intera, e che nome dare al file che ne esce.
//
// «Esporta vista» esportava le righe SCESE, non quelle filtrate: con la barra che dice «300 di
// 5.293» ne usciva un xlsx da 300 righe, senza una parola sul troncamento. Un file che sembra
// completo e non lo è è peggio di un export che manca — ci si costruiscono sopra pivot e conteggi,
// e il numero sbagliato non ha nulla che lo denunci.
//
// Quindi l'export ripercorre la query dei filtri fino in fondo. Le due decisioni che vale la pena
// tenere pure e testabili sono queste: quante pagine servono, e come si chiama il file.

/** Righe per richiesta durante l'export: è il tetto che `/api/acea/ordini` accetta. */
export const PER_PAGINA_EXPORT = 500;

/**
 * Tetto di righe per un singolo export.
 *
 * Il foglio si costruisce nel browser, quindi un tetto serve. Il registro oggi ne ha ~5.300 e la
 * soglia non si incontra lavorando; se la si incontra è meglio dirlo e chiedere di restringere i
 * filtri che produrre in silenzio un file mozzato — cioè ricadere nel difetto che si sta correggendo.
 */
export const MAX_RIGHE_EXPORT = 20_000;

/** Numeri di pagina (1-based) da chiedere per coprire `totale` righe. */
export function pagineExport(totale: number, perPagina: number = PER_PAGINA_EXPORT): number[] {
  if (!Number.isFinite(totale) || totale <= 0 || perPagina <= 0) return [];
  const quante = Math.ceil(totale / perPagina);
  return Array.from({ length: quante }, (_, i) => i + 1);
}

export type NomeExport = {
  famiglia: 'dunning' | 'massive';
  /** Stato del segmented: è parte di cosa c'è dentro il file, non un dettaglio della vista. */
  stato: 'tutti' | 'aperti' | 'chiusi';
  /** Giorno del registro ('YYYY-MM-DD'), preso dal server. */
  oggi: string;
  /** Almeno un filtro di colonna o una ricerca libera attiva. */
  filtrato: boolean;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nome del file: dice cosa restringe il contenuto.
 *
 * Un xlsx sopravvive alla schermata da cui è uscito — finisce in una cartella, viene riaperto a
 * distanza di settimane, girato a qualcun altro. Il nome è l'unica cosa che si porta dietro: se il
 * file contiene i soli ordini aperti del dunning, deve dirlo, altrimenti chi lo riapre conta 1.800
 * righe e crede sia tutto il registro.
 *
 * `filtrato` non elenca i filtri (diventerebbe illeggibile e non entrerebbe in un nome di file):
 * dice che ce n'erano, cioè che quel totale non è il totale della famiglia.
 */
export function nomeFileExport({ famiglia, stato, oggi, filtrato }: NomeExport): string {
  const parti: string[] = ['acea', famiglia, stato];
  if (ISO.test(oggi)) parti.push(oggi.replaceAll('-', ''));
  if (filtrato) parti.push('filtrato');
  return `${parti.join('-')}.xlsx`;
}
