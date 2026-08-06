// lib/acea/selezioneRegistro.ts
// PURA: da quale relazione si legge il registro, e con quali colonne.
//
// Vive fuori dalla route perché è il punto in cui una svista NON dà un errore: la query parte, il
// conteggio è giusto e la tabella esce vuota. È già successo — `id` chiesto nel `.in()` della
// rilettura di pagina e non nella `select`, quindi righe senza `id`, mappa con chiavi `undefined`
// e ogni riga scartata. In un file di route nessun test poteva accorgersene.

import { PROFILO_COMMESSA } from './famiglia';
import type { FiltriOrdini } from './filtriOrdini';

export const COLONNE = [
  'odl', 'numero_operazione', 'famiglia', 'tipo_ordine', 'attivita', 'denominazione',
  'stato', 'stato_desc', 'aperto',
  'data_creazione', 'cardine_al', 'scadenza', 'data_completamento',
  'operatore_cognome', 'operatore_nome',
  'causale', 'causale_desc', 'esito_positivo',
  'via', 'civico', 'cap', 'comune', 'provincia', 'microarea', 'microarea_stimata',
  'impianto', 'matricola', 'matricola_norm', 'sospetto_troncamento',
  // L'anagrafica dell'utente: piena su acqualatina (dal master del committente), NULL su ACEA,
  // che nel suo export non la manda. Le colonne esistono su entrambe le tabelle proprio perché
  // questa select vale per tutt'e due — vedi la nota in 20260731170000_acqualatina_ordini.sql.
  'nominativo', 'recapito',
  'valore_netto', 'escludi_consuntivazione', 'codice_sla', 'priorita_testo',
  'testo_ordine', 'centro_lavoro', 'note',
  // Il TOP di ACEA. Sta nella select principale e non fra le opzionali perché la colonna esiste
  // su ENTRAMBE le tabelle (migration 20260804110000): la lista è una sola per due registri.
  'top',
  /*
    `operatore_nome` e `data_completamento` — l'esecutore e la data di ACEA — stavano QUI una
    seconda volta, e sono già più su (righe 15-16).

    Il duplicato è nato da una diagnosi giusta con una causa sbagliata: le colonne
    «Operatore ACEA»/«Esecuzione ACEA» uscivano vuote su un ordine che ACEA aveva chiuso senza
    passare dalla nostra pianificazione, e sembrava un import che non avesse caricato niente. Il
    dato però nella select c'era già: mancava la COLONNA in tabella, non il campo nella query.
    PostgREST accetta un elenco con ripetizioni senza dire niente, quindi il doppione è rimasto
    invisibile fino a che un test non ha contato le voci distinte.
  */
  /*
    Gli appunti (`pianificato_*_bozza`) NON sono qui, ed è deliberato: si leggono a parte, con la
    stessa degradazione delle saracinesche. Sono colonne di una migration che potrebbe non essere
    ancora passata sul database che sta servendo questo codice, e una colonna sconosciuta in questo
    elenco non fa fallire una decorazione — fa fallire la query del registro, cioè il motivo per
    cui si apre la schermata. È già successo una volta — e di nuovo il 05/08 con `matricola_nuova`
    (20260805110000_acqualatina_matricola_nuova_colonna.sql), messa qui per errore: il deploy del
    codice è arrivato prima che la migration fosse applicata in produzione, «Errore lettura
    registro ACEA» su TUTTE le famiglie per il tempo in cui è rimasta. Non torna qui: si legge
    a parte, sotto, con la stessa degradazione.
  */
].join(', ');

/**
 * Da dove si LEGGE il registro di questa vista.
 *
 * Sulle massive è una vista che unisce `acea_ordini` e gli interventi completati senza ODL — le
 * limitazioni aperte a mano dal «+», che un ordine ACEA non ce l'hanno per costruzione. Sono
 * 1.317 righe di lavoro fatto che il registro non mostrava da nessuna parte.
 *
 * Vale solo in LETTURA, ed è il motivo per cui non è in `PROFILO_COMMESSA.tabellaOrdini`: quel
 * campo lo usano anche le scritture (pianificazione, appunti, celle), che devono continuare a
 * puntare alla tabella vera. Una vista con una UNION non è aggiornabile, e farcele passare sopra
 * avrebbe rotto il salvataggio su ogni riga del registro.
 */
export function relazioneRegistro(f: FiltriOrdini): string {
  if (f.famiglia === 'massive') return 'acea_registro_massive';
  return PROFILO_COMMESSA[f.famiglia ?? 'dunning'].tabellaOrdini;
}

/**
 * Le colonne da leggere: quelle di sempre, più le due che esistono solo nella vista massive.
 *
 * Aggiunte QUI e non nella `COLONNE` condivisa perché quella gira anche su `acea_ordini` e su
 * `acqualatina_ordini`, dove `intervento_id` e `sola_lettura` non esistono. Una colonna ignota in
 * quell'elenco non degrada una decorazione: fa fallire la query del registro, cioè la schermata.
 * È già successo due volte (vedi la nota dentro `COLONNE`), e non serve una terza.
 */
export function selezioneRegistro(f: FiltriOrdini): string {
  /*
    `id` in TESTA, e non è un dettaglio: è la chiave con cui la pagina si rilegge dopo l'incrocio.

    Chiederlo nel `.in()` senza chiederlo anche nella select è passato senza errore e senza righe —
    la risposta arrivava piena ma priva di `id`, la mappa si costruiva con chiavi `undefined` e
    ogni riga della pagina finiva scartata. Conteggio giusto, tabella vuota: il modo peggiore di
    rompersi, perché somiglia a un filtro che non trova niente.
  */
  const base = `id, ${COLONNE}`;
  return f.famiglia === 'massive' ? `${base}, intervento_id, sola_lettura` : base;
}
