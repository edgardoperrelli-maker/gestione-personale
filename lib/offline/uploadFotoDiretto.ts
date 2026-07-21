/**
 * Fallback di upload foto quando la coda offline (IndexedDB) NON è utilizzabile.
 *
 * Contesto (incidente reale, operatore su Via Leonardo da Vinci): dopo una giornata
 * pesante (centinaia di foto) lo storage IndexedDB del telefono arriva a saturazione.
 * Le risposte di testo (piccole) continuano a salvarsi, ma `dbBlob.salva` — il blob
 * multi-MB della foto — lancia QuotaExceededError → `accodaFoto` ritorna null → la foto
 * NON viene accodata, `onChange` non scatta e la UI mostra "Errore upload": la foto va
 * persa anche se rete e server sono perfettamente sani.
 *
 * Queste funzioni caricano la foto DIRETTAMENTE sul server (stesso endpoint del sync) e
 * registrano il path sulla voce con un POST diretto, bypassando IndexedDB: così una
 * memoria del telefono satura non fa più perdere le foto quando c'è rete.
 */

/** True se il device è sicuramente offline. In SSR/test `navigator` può mancare → non-offline. */
function sicuramenteOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Carica un singolo file foto direttamente sul server (bypassa la coda IndexedDB) e
 * restituisce il path di storage reale, oppure null se offline / errore di rete / server.
 * Il `clientKey` casuale rende il path idempotente lato server (upsert) come nel sync.
 */
export async function caricaFotoDiretta(
  token: string,
  file: Blob,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (sicuramenteOffline()) return null;
  try {
    const clientKey = crypto.randomUUID();
    const fd = new FormData();
    fd.append('file', file, `${clientKey}.jpg`);
    fd.append('clientKey', clientKey);
    const res = await fetchFn(`/api/r/${token}/foto-campo`, { method: 'POST', body: fd });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { path?: string };
    return typeof j.path === 'string' && j.path ? j.path : null;
  } catch {
    return null;
  }
}

/**
 * Registra le risposte di una voce con un POST diretto a /voce (bypassa IndexedDB). Il
 * server fa il merge idempotente delle risposte, quindi inviare la singola risposta foto
 * è sicuro e non sovrascrive gli altri campi. Ritorna true se il server ha accettato (2xx).
 */
export async function salvaVoceDiretta(
  token: string,
  voceId: string,
  risposte: Record<string, unknown>,
  taskId: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (sicuramenteOffline()) return false;
  try {
    const res = await fetchFn(`/api/r/${token}/voce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voceId, taskId, risposte }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
