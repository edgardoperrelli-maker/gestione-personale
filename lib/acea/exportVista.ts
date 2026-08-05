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

import type { StatoFiltro } from './filtriOrdini';
import type { Famiglia } from './famiglia';

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
  famiglia: Famiglia;
  /** Stato del segmented: è parte di cosa c'è dentro il file, non un dettaglio della vista. */
  stato: StatoFiltro;
  /** Scheda-comune attiva (massive): restringe il contenuto quanto lo stato, e il nome lo dice. */
  comune?: string | null;
  /** Giorno del registro ('YYYY-MM-DD'), preso dal server. */
  oggi: string;
  /** Almeno un filtro di colonna o una ricerca libera attiva. */
  filtrato: boolean;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 'RIGNANO FLAMINIO' → 'rignano-flaminio': nel nome di un file gli spazi sono guai. */
function fettaComune(comune: string | null | undefined): string | null {
  const pulito = String(comune ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return pulito === '' ? null : pulito;
}

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
export function nomeFileExport({ famiglia, stato, comune, oggi, filtrato }: NomeExport): string {
  // Le famiglie ACEA stanno sotto il prefisso della commessa; acqualatina È la commessa, e
  // «acea-acqualatina-…» direbbe il committente sbagliato a chi ritrova il file fra mesi.
  const parti: string[] = famiglia === 'acqualatina' ? ['acqualatina'] : ['acea', famiglia];
  const c = fettaComune(comune);
  if (c) parti.push(c);
  parti.push(stato);
  if (ISO.test(oggi)) parti.push(oggi.replaceAll('-', ''));
  if (filtrato) parti.push('filtrato');
  return `${parti.join('-')}.xlsx`;
}

/**
 * Nome del FOGLIO dentro il file (la tab di Excel), non del file.
 *
 * `RegistroAcea` è condiviso dalle tre famiglie, ma il foglio interno restava scritto 'ACEA' anche
 * per l'export di AcquaLatina: chi apriva il file vedeva la tab «ACEA» sopra righe di
 * `acqualatina_ordini` — lo stesso errore di categorizzazione che `nomeFileExport` evita già nel
 * nome del file, qui riapparso dentro.
 */
export function nomeFoglioExport(famiglia: Famiglia): string {
  return famiglia === 'acqualatina' ? 'AcquaLatina' : 'ACEA';
}
