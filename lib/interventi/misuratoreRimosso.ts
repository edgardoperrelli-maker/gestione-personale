/**
 * Stabilisce se un intervento, dato il suo `intervento_tipo`, rappresenta una
 * rimozione di misuratore che deve confluire nel registro "Misuratori Rimossi".
 *
 * Qualifica: il tipo contiene "rimozione" (es. "Rimozione misuratore per morosità"),
 * perché comporta lo scarico fisico di un contatore da tracciare nel flusso logistico.
 *
 * Esclude: la "Rimozione impianto abusivo" (e ogni variante con "abusiv*", es.
 * "rimozione allaccio abusivo"). Questi interventi NON scaricano un misuratore e
 * quindi non devono entrare nel registro — coerente con il "Fuori scope" della
 * design spec (2026-06-08-misuratori-rimossi-design.md).
 *
 * NB: il chiamante deve comunque verificare gli altri requisiti del registro
 * (committente 'acea', esito 'eseguito_positivo', matricola voce presente).
 */
export function qualificaRimozioneMisuratore(interventoTipo: string | null | undefined): boolean {
  const tipo = (interventoTipo ?? '').toLowerCase();
  return tipo.includes('rimozione') && !tipo.includes('abusiv');
}

/**
 * Stabilisce se un record del registro deve restare VISIBILE in tabella.
 *
 * Un record viene creato all'invio del rapportino quando la voce è positiva. Se in
 * seguito l'intervento collegato viene corretto a esito NEGATIVO (es. "Nessun
 * passaggio", "NO"), nessun misuratore è stato realmente rimosso: il record è un
 * fantasma e non deve apparire in tabella.
 *
 * L'esclusione si applica SOLO quando il record è ancora nello stato logistico
 * iniziale `da_consegnare_deposito`: negli stati avanzati il misuratore è già nel
 * flusso fisico del deposito e va preservato (stessa regola della rimozione in
 * `/api/misuratori/sync`).
 *
 * @param esitoIntervento esito dell'intervento collegato. `'eseguito_positivo'` →
 *   visibile; un esito negativo è rappresentato da `null`. `undefined` significa
 *   "intervento non trovato" (es. eliminato): in tal caso non si nasconde nulla,
 *   per non perdere record su un dato mancante.
 *
 * I record senza intervento collegato (`intervento_id` null) restano sempre visibili:
 * sono tracciati manualmente dall'ufficio e non hanno un esito da verificare.
 */
export function misuratoreRimossoVisibile(
  record: { intervento_id: string | null; stato: string },
  esitoIntervento: string | null | undefined,
): boolean {
  if (!record.intervento_id) return true;                      // record manuale: sempre visibile
  if (record.stato !== 'da_consegnare_deposito') return true;  // già nel flusso fisico
  if (esitoIntervento === undefined) return true;              // intervento non trovato: non nascondere
  return esitoIntervento === 'eseguito_positivo';              // visibile solo se rimozione confermata
}
