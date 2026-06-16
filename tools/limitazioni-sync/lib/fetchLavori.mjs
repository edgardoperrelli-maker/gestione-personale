// tools/limitazioni-sync/lib/fetchLavori.mjs
// I/O: scarica i lavori dall'endpoint dell'app. `fetchImpl` iniettabile per i test.
export async function fetchLavori({ endpointUrl, exportKey, from, to }, fetchImpl = fetch) {
  const url = `${endpointUrl}?from=${from}&to=${to}`;
  const res = await fetchImpl(url, { headers: { 'x-export-key': exportKey } });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`Endpoint ${res.status}: ${corpo}`);
  }
  const json = await res.json();
  if (!Array.isArray(json.righe)) {
    throw new Error(`Risposta endpoint inattesa (manca 'righe'): ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.righe;
}
