// lib/acea/parseTestoOrdine.ts
// PURA: estrae impianto e matricola da "Testo breve Ordine" dell'export ACEA.
//
// PERCHÉ SERVE. Nell'export la colonna "Matricola misuratore" è vuota su tutte le limitazioni
// massive (2.492 righe) e su tutte le sostituzioni saracinesca (267): per quelle famiglie il
// misuratore è codificato dentro il testo dell'ordine. Con questo parser la copertura di
// impianto+matricola sale al 100% di quelle righe e al 99,85% dell'intero export.
//
// TRE FORMATI, UN SOLO PARSER (verificati su 5.293 righe reali, 25 varianti di scrittura):
//   <impianto>_LIM_MAS_MATR_<matricola>_LENTE…   1.965 righe
//   <impianto>_LIM_MASS_<matricola>_MM_<n>         525 righe
//   <impianto>_SOST_SARAC_SER_<matricola>           94 righe   (anche minuscolo)
//
// DUE TRAPPOLE DOCUMENTATE:
//  1. Il campo SAP è troncato a 40 caratteri. `LEN`/`LENT`/`LENTE_M`/`LENTE_MM_` non sono
//     suffissi diversi: sono la parola "LENTE" tagliata. La matricola sta PRIMA del suffisso e
//     nell'export attuale non risulta mai troncata, ma il margine è di 16 caratteri — oltre,
//     verrebbe tagliata. Da qui `sospettoTroncamento`, che segnala senza bloccare.
//  2. Il marcatore NON identifica l'attività: 173 delle 267 saracinesche usano `LIM_MAS_MATR_`.
//     L'attività si legge SOLO da "Operazione testo breve".
//
// Fuori perimetro di proposito: gli impianti in forma libera delle rimozioni abusive
// ("CESSATI N. IMPIANTO 4000603152"). Quelle righe hanno la colonna `Impianto` valorizzata, e
// dove non ce l'hanno la matricola non serve — non vale un secondo percorso di parsing.

export type EstrazioneMisuratore = {
  /** Numero impianto (10 cifre): chiave stabile del punto di fornitura. */
  impianto: string | null;
  /** Matricola del misuratore, nella forma grezza dell'export (26 varianti note). */
  matricola: string | null;
  /** true se il testo è al limite dei 40 caratteri e la matricola potrebbe essere tagliata. */
  sospettoTroncamento: boolean;
};

/** Lunghezza massima del campo "Testo breve Ordine" in SAP. */
const MAX_TESTO = 40;

// impianto = 10 cifre iniziali; poi uno dei tre marcatori; poi la matricola fino al separatore.
// La classe della matricola esclude `_` di proposito: è il separatore che chiude il token
// (`…_MM_6`, `…_LEN`), e includerlo mangerebbe il suffisso.
const RE_MISURATORE =
  /^(\d{10})[_ ](?:LIM[_ ]MAS(?:S)?[_ ](?:MATR[_ ])?|SOST[_ ]SARAC[_ ](?:SER[_ ])?)([0-9A-Za-z-]+)/i;

const VUOTO: EstrazioneMisuratore = { impianto: null, matricola: null, sospettoTroncamento: false };

/** Estrae impianto e matricola dal testo dell'ordine. Non lancia mai: testo ignoto → tutto null. */
export function parseTestoOrdine(testo: string | null | undefined): EstrazioneMisuratore {
  const s = String(testo ?? '').trim();
  if (s === '') return { ...VUOTO };

  const m = RE_MISURATORE.exec(s);
  if (!m) return { ...VUOTO };

  const [, impianto, matricola] = m;
  // La matricola arriva fino a fine stringa E la stringa è al limite del campo: il suffisso è
  // stato tagliato, quindi non possiamo escludere che lo sia stata anche la matricola.
  const finisceInFondo = s.indexOf(matricola) + matricola.length === s.length;
  return {
    impianto,
    matricola,
    sospettoTroncamento: s.length >= MAX_TESTO && finisceInFondo,
  };
}
