// tools/limitazioni-sync/lib/dataCella.mjs
// PURE: gestione date-aware della colonna "data" del file ACEA.
// Si scrive una vera data Excel (Date a mezzogiorno locale, niente fuso-shift) e si
// confronta per GIORNO, così "data Excel" vs "2026-06-16" non genera falsi conflitti.

/** Estrae 'YYYY-MM-DD' (giorno locale) da Date | stringa ISO | numero; '' se vuoto/invalido. */
export function giornoDa(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') return ''; // seriali Excel grezzi non gestiti: trattali come vuoto
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' → Date a mezzogiorno locale (evita lo slittamento di giorno per fuso); null se invalido. */
export function aDataExcel(iso) {
  const g = giornoDa(iso);
  if (!g) return null;
  const [y, mo, d] = g.split('-').map(Number);
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

/** Policy "riempi vuote + segnala conflitti", ma confrontando per GIORNO.
 *  Ritorna { azione: 'scrivi'|'salta'|'conflitto', valore: Date|null, esistente? }. */
export function decidiScritturaData(cellaEsistente, nuovoIso) {
  const nuovoG = giornoDa(nuovoIso);
  if (nuovoG === '') return { azione: 'salta', valore: null };
  const esistenteG = giornoDa(cellaEsistente);
  if (esistenteG === '') return { azione: 'scrivi', valore: aDataExcel(nuovoG) };
  if (esistenteG === nuovoG) return { azione: 'salta', valore: null };
  return { azione: 'conflitto', valore: aDataExcel(nuovoG), esistente: esistenteG };
}
