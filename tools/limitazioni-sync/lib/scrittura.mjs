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
 * Serve a riconoscere l'upgrade negativo→positivo: cella già "No" + lavoro vincente positivo.
 * Falso se la cella è vuota o il testo negativo non è definito.
 */
export function cellaEsitoNegativa(cellaEsistente, esitoNegativo) {
  const neg = t(esitoNegativo).toUpperCase();
  if (neg === '') return false;
  return t(cellaEsistente).toUpperCase() === neg;
}
