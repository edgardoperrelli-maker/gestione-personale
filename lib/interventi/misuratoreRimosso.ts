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
