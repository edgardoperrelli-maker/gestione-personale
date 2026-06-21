// tools/limitazioni-sync/lib/apiAgente.mjs
// I/O: client HTTP dell'agente verso l'app (tick + report). `fetchImpl` iniettabile per i test.

/** Origin (schema+host[:porta]) dell'endpoint export -> base per le route agente. */
export function baseUrlDaEndpoint(url) {
  return new URL(url).origin;
}

async function postJson(url, exportKey, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-export-key': exportKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`POST ${url} ${res.status}: ${corpo}`);
  }
  return res.json();
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
