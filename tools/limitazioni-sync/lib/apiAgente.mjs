// tools/limitazioni-sync/lib/apiAgente.mjs
// I/O: client HTTP dell'agente verso l'app (tick + report). `fetchImpl` iniettabile per i test.

/** Origin (schema+host[:porta]) dell'endpoint export -> base per le route agente. */
export function baseUrlDaEndpoint(url) {
  return new URL(url).origin;
}

// Retry su errori di rete/5xx: il report di fine giro (anche dopo ore di assegnazione) NON deve
// perdersi per un singolo errore transitorio sull'invio finale. È successo col giro del 30/06:
// 71 ODL assegnati su ACEA ma report mai arrivato → pannello "Esito assegnazione ACEA" vuoto.
async function postJson(url, exportKey, body, fetchImpl, { tentativi = 4, attesaMs = 2000 } = {}) {
  let ultimoErr;
  for (let t = 1; t <= tentativi; t++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-export-key': exportKey },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
      const corpo = await res.text().catch(() => '');
      const err = new Error(`POST ${url} ${res.status}: ${corpo}`);
      err.status = res.status;
      throw err;
    } catch (e) {
      ultimoErr = e;
      // 4xx = errore client permanente (es. 401 chiave errata): ritentare non aiuta → fallisci subito.
      // Si ritenta solo su errori di rete o 5xx transitori (il report di fine giro non deve perdersi).
      if (e && e.status >= 400 && e.status < 500) throw e;
      if (t < tentativi) await new Promise((r) => setTimeout(r, attesaMs * t));
    }
  }
  throw ultimoErr;
}

/** POST /api/agente/tick con le colonne rilevate -> { eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo }. */
export function tick({ baseUrl, exportKey, files }, fetchImpl = fetch) {
  return postJson(`${baseUrl}/api/agente/tick`, exportKey, { files }, fetchImpl);
}

/** POST /api/agente/report con il report del giro -> { ok: true }. */
export function inviaReport({ baseUrl, exportKey, report }, fetchImpl = fetch) {
  return postJson(`${baseUrl}/api/agente/report`, exportKey, report, fetchImpl);
}

/** POST /api/agente/pianificabili con le righe lette per un giorno. */
export function inviaPianificabili({ baseUrl, exportKey, file, data, righe }, fetchImpl = fetch) {
  return postJson(`${baseUrl}/api/agente/pianificabili`, exportKey, { file, data, righe }, fetchImpl);
}

/** GET /api/agente/acea-assegnazioni?data= → { data, righe, scartati } (header x-export-key). */
export async function fetchAceaAssegnazioni({ baseUrl, exportKey, data }, fetchImpl = fetch) {
  const url = `${baseUrl}/api/agente/acea-assegnazioni?data=${encodeURIComponent(data)}`;
  const res = await fetchImpl(url, { headers: { 'x-export-key': exportKey } });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`GET ${url} ${res.status}: ${corpo}`);
  }
  return res.json();
}
