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
//     suffissi diversi: sono la parola "LENTE" tagliata.
//
//     LA MATRICOLA ORA RISULTA TAGLIATA DAVVERO, e questo commento diceva il contrario. Con il
//     marcatore `LIM_MASS_MATR_` il prefisso è esattamente 25 caratteri (`<impianto 10>` + 15):
//     restano 15 caratteri per la matricola, ma le seriali SETA/WTTS ne hanno 16 — verificato su
//     990 occorrenze su 990 fra colonna Matricola dell'export, `interventi` e master snapshot,
//     con ZERO occorrenze a 15. 25+16=41 > 40: il sedicesimo carattere non entra.
//
//     Nell'export di oggi sono 126 righe, e la prova indipendente è la collisione: 125 righe
//     massive portano solo 54 matricole distinte su 125 impianti (2,31 righe per matricola contro
//     1,00 del gruppo sano), e `SETA07122500630` compare su OTTO impianti diversi. Sono otto
//     misuratori schiacciati sullo stesso prefisso.
//
//     Il marcatore corto `LIM_MASS_` (9 caratteri) lascia spazio a sufficienza e la stessa
//     famiglia di seriale ci sta intera: il problema è il marcatore, non il misuratore.
//
//     Da qui `sospettoTroncamento`, che segnala senza bloccare — e da qui l'avvertenza che
//     `matricola_norm` su quelle righe NON è una chiave: ombreggia fino a otto misuratori, e un
//     join ci va in fan-out.
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
  /** true se il testo e` vicino al limite del campo e la matricola potrebbe essere tagliata. */
  sospettoTroncamento: boolean;
};

/** Lunghezza massima del campo "Testo breve Ordine" in SAP. */
/*
  Il limite del campo SAP, e la soglia del sospetto. NON si abbassa "per sicurezza".

  Sembra prudente allargare la rete qualche carattere sotto i 40. È stato provato, misurato, e
  scartato: le 93 righe che si aggiungerebbero fra 30 e 39 sono TUTTE `SOST_SARAC_SER_`, il cui
  prefisso è 26 caratteri, e stanno sotto il limite del campo — quindi SAP non ha tagliato niente.
  È un fatto strutturale, non una probabilità. Le loro lunghezze coincidono con quelle delle
  saracinesche integre, e nessuna ha un completamento altrove nel registro.

  Novantatré falsi allarmi in un elenco «da controllare» non lo rendono più sicuro: lo rendono un
  elenco che si smette di guardare. Il sospetto vale solo AL limite, dove il taglio è certo.
*/
const MAX_TESTO = 40;

// impianto = 10 cifre iniziali; poi uno dei tre marcatori; poi la matricola fino al separatore.
// La classe della matricola esclude `_` di proposito: è il separatore che chiude il token
// (`…_MM_6`, `…_LEN`), e includerlo mangerebbe il suffisso.
const RE_MISURATORE =
  /^(\d{10})[_ ](?:LIM[_ ]MAS(?:S)?[_ ](?:MATR[_ ])?|SOST[_ ]SARAC[_ ](?:SER[_ ])?)([0-9A-Za-z-]+)/i;

const VUOTO: EstrazioneMisuratore = { impianto: null, matricola: null, sospettoTroncamento: false };

/** Matricola normalizzata per gli aggancî: maiuscolo, solo A-Z0-9 (26 forme di scrittura note). */
export function normalizzaMatricola(m: string | null | undefined): string | null {
  const v = String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return v === '' ? null : v;
}

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
