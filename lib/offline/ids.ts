/**
 * Id canonico (e chiave di coalescing) di un elemento outbox di tipo 'voce'.
 * DEVE essere usato sia dal form operatore (Fase 2) sia dall'orchestratore di sync,
 * così i due salvataggi della stessa voce coincidono sulla STESSA chiave IndexedDB
 * (niente doppioni). Coincide con `chiaveCoalescing` per le voci (`voce:token:voceId`).
 */
export function idOutboxVoce(token: string, voceId: string): string {
  return `voce:${token}:${voceId}`;
}
