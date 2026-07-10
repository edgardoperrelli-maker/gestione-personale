// PURA: decide se una riga master con saracinesca=SI genera PRODUZIONE "Sostituzione saracinesca".
// ZAGAROLO ha la colonna "esito" (eseguito/no): fonte di verità INVARIATA, nessun fallback.
// Il master DUNNING NON ha quella colonna (esito sempre vuoto): la fonte di verità è il nostro DB
// (da cui la PR #73 scrive "SI" in Saracinesca), letto tramite l'ODL positivo.
export function saracinescaProdotta(
  saracinesca: string | null | undefined,
  esitoMaster: string | null | undefined,
  dbEsitoOk: boolean | null | undefined,
): boolean {
  const sara = String(saracinesca ?? '').trim().toUpperCase() === 'SI';
  if (!sara) return false;
  const esito = String(esitoMaster ?? '').trim().toLowerCase();
  if (esito) return esito === 'eseguito';
  return dbEsitoOk === true;
}
