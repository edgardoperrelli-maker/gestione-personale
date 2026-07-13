// lib/interventi/rimozioneMisuratore.ts
// PURO: riconosce se un `intervento_tipo` (free-text proveniente dalla colonna
// "Operazione testo breve" del file ACEA "LIMITAZIONI CON ORDINE.xlsx")
// rappresenta una RIMOZIONE misuratore, e quindi deve confluire nel modulo
// "Misuratori Rimossi".
//
// Il file ACEA usa due forme per la stessa operazione:
//   • estesa      → "Rimozione misuratore ..."        (contiene "rimozione")
//   • abbreviata  → "Rim Mis/Mod radio per morosità"  (contiene solo "Rim")
// Il vecchio controllo `.includes('rimozione')` perdeva tutte le righe
// abbreviate: i misuratori rimossi con quelle operazioni non comparivano nel
// modulo. Qui matchiamo entrambe le forme:
//   • \brimoz  → "rimozione" / "rimozioni" (qualsiasi maiuscolo/minuscolo)
//   • \brim\b  → l'abbreviazione "Rim" come token isolato (es. "Rim Mis/Mod…")
const RIMOZIONE_RE = /\brimoz|\brim\b/i;

// ESCLUSIONE — rimozione impianto/allaccio/contatore ABUSIVO.
// Il misuratore rimosso da un impianto abusivo NON entra mai nei nostri
// magazzini (non è un contatore ACEA da scaricare a deposito), quindi questa
// attività non deve MAI confluire nel modulo "Misuratori Rimossi" — nemmeno
// quando nel campo note è stata annotata per errore una matricola. Questo
// gate ne blocca l'ingresso a monte, indipendentemente dalla matricola.
// Coerente con la spec del registro ("la rimozione allaccio abusivo non
// produce un record") e con voceDaAttivita ("ABUSIVO prima di tutto").
const ABUSIVO_RE = /abusiv/i;

/**
 * True se l'operazione (intervento_tipo) è una rimozione misuratore ACEA che
 * deve confluire nel modulo "Misuratori Rimossi". Le rimozioni di impianti
 * abusivi sono sempre escluse.
 */
export function isRimozioneTipo(tipo: string | null | undefined): boolean {
  const t = (tipo ?? '').trim();
  if (ABUSIVO_RE.test(t)) return false;
  return RIMOZIONE_RE.test(t);
}
