// PURA: alias curati che allineano descrizioni attività "fuorvianti" alla forma
// canonica presente in tassonomia. Chiave e valore sono FORME NORMALIZZATE
// (come `chiaveTassonomia`: maiuscolo, senza accenti, spazi collassati).
//
// Applicati SOLO in lettura, opt-in, da `risolviGruppo(..., { allinea: true })`, usato dal
// modulo Performance per accorpare i duplicati/typo nei filtri (una voce per attività reale).
// I write-path NON li applicano: lo storage resta grezzo, così dedup (identitaIntervento) e
// listino produzione (`acea_attivita_alias`) non cambiano. L'auto-allineamento in scrittura è
// una fase separata (va gestita anche sui consumatori del testo grezzo, non solo qui).
//
// INVARIANTE (coperta da tassonomia.test.ts): ogni valore canonico è un literal della
// tassonomia (seed 20260720150000) e appartiene allo STESSO gruppo della variante — così anche
// se un domani fossero usati altrove, i consumatori che leggono solo il gruppo non cambiano.
//
// Copre solo casi "Sicuri": typo, punteggiatura, stesso codice ATLAS con/senza descrizione,
// singolare/plurale della stessa attività. NON accorpa varianti realmente distinte
// (A/B/C, Sonda, GN B/C, "su Impianto").

// `${committenteEquivalente}|${normVariante}`  →  normCanonica
const ALIAS: Record<string, string> = {
  // Acea — famiglia Limitazioni Massive (canonico = literal ancorato dall'export)
  'acea|LIMITAZIONE MASSIVA': 'LIMITAZIONI MASSIVE',
  'acea|LIMITAZIONI MASSICE': 'LIMITAZIONI MASSIVE', // typo
  // Italgas — apostrofo iniziale e stesso codice ATLAS con/senza descrizione
  "italgas|'UT MOROSITA' PRIMO PASSAGGIO": "UT MOROSITA' PRIMO PASSAGGIO",
  'italgas|DIS00N': 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO',
  "italgas|S-MR-002": "S-MR-002 - RIATTIVAZ. SERVIZIO SOSPESO PER MOROSITA'",
  'italgas|S-AI-022': 'S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA',
};

/** Riscrive la chiave normalizzata nella forma canonica (o la lascia invariata). */
export function allineaChiaveAttivita(committenteEq: string, norm: string): string {
  return ALIAS[`${committenteEq}|${norm}`] ?? norm;
}

/** Mappa alias (per test dell'invariante gruppo + eventuale editor futuro). */
export const ALIAS_ATTIVITA = ALIAS;
