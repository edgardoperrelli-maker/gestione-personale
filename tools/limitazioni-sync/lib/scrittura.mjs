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
