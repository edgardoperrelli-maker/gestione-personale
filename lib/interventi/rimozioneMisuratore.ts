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

/** True se l'operazione (intervento_tipo) è una rimozione misuratore ACEA. */
export function isRimozioneTipo(tipo: string | null | undefined): boolean {
  return RIMOZIONE_RE.test((tipo ?? '').trim());
}
