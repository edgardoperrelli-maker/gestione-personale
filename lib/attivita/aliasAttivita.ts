// PURA: alias curati che allineano descrizioni attività "fuorvianti" alla forma
// canonica presente in tassonomia. Chiave e valore sono FORME NORMALIZZATE
// (come `chiaveTassonomia`: maiuscolo, senza accenti, spazi collassati).
//
// Un solo chokepoint (`risolviGruppo`) li applica, quindi DUE consumatori li ereditano:
//  - modulo Performance (lettura): accorpa i duplicati nei filtri → una voce per attività reale;
//  - import/scrittura: AUTO-ALLINEAMENTO — una descrizione fuorviante non rifiuta più il file,
//    viene riscritta nella forma canonica.
//
// INVARIANTE (verificata in test): ogni valore canonico esiste in tassonomia e appartiene
// allo STESSO gruppo della variante. Così i consumatori che usano solo il gruppo (export
// lim_massive `gruppo_attivita='LIMITAZIONI MASSIVE'`, KPI, storico) NON cambiano comportamento.
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
