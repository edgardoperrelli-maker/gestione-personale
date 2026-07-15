// tools/limitazioni-sync/lib/scrittura.mjs
// PURE: decide cosa scrivere in una cella. Policy: "riempi vuote + segnala conflitti".

const t = (v) => (v == null ? '' : String(v).trim());

/** Ritorna { azione: 'scrivi' | 'salta' | 'conflitto', valore, esistente? }. */
export function decidiScrittura(cellaEsistente, nuovoValore) {
  const nuovo = t(nuovoValore);
  if (nuovo === '') return { azione: 'salta', valore: '' };
  const esistente = t(cellaEsistente);
  if (esistente === '') return { azione: 'scrivi', valore: nuovo };
  if (esistente === nuovo) return { azione: 'salta', valore: nuovo };
  return { azione: 'conflitto', valore: nuovo, esistente };
}

/**
 * True se la cella esito contiene (normalizzato: trim + maiuscolo) il testo dell'esito NEGATIVO.
 * Serve al refresh negativo→negativo: cella già "No" + lavoro vincente negativo più recente.
 * Falso se la cella è vuota o il testo negativo non è definito.
 */
export function cellaEsitoNegativa(cellaEsistente, esitoNegativo) {
  const neg = t(esitoNegativo).toUpperCase();
  if (neg === '') return false;
  return t(cellaEsistente).toUpperCase() === neg;
}

/**
 * True se la cella esito contiene un testo NON vuoto e DIVERSO dal positivo (trim + maiuscolo).
 * Serve alla regola "il positivo vince SEMPRE": quando il lavoro vincente è POSITIVO, qualunque
 * esito già a file va sovrascritto — non solo il "No" canonico, anche un testo libero scritto
 * a mano (es. "NO PASSAGGIO"). Cella vuota → false (resta la policy riempi-vuote); cella già
 * positiva (case-insensibile) → false (idempotente: i giri ripetuti non riscrivono).
 */
export function cellaEsitoDaSovrascrivere(cellaEsistente, esitoPositivo) {
  const pos = t(esitoPositivo).toUpperCase();
  if (pos === '') return false;
  const cella = t(cellaEsistente).toUpperCase();
  return cella !== '' && cella !== pos;
}
