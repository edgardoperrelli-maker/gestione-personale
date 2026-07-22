// PURA: alias curati che allineano descrizioni attività "fuorvianti" alla forma canonica
// presente in tassonomia. Chiave e valore sono FORME NORMALIZZATE (come `chiaveTassonomia`:
// maiuscolo, senza accenti, spazi collassati).
//
// DUE tier, applicati da `risolviGruppo(..., { allinea })`, distinti per SICUREZZA a valle:
//
//  - SCRITTURA (`allinea:'scrittura'`): applicati nei write-path (import, taskToIntervento,
//    manuali), quindi cambiano il TESTO MEMORIZZATO. Solo typo/punteggiatura e il singolare→
//    plurale massive: casi genuinamente fuorvianti da correggere allo storage. NON riscrivono
//    i codici ATLAS (il codice bare è l'identità canonica dell'attività: lasciarlo com'è evita
//    churn inutile sullo storage e su export/listino che mostrano intervento_tipo).
//
//  - LETTURA (`allinea:'lettura'`): SCRITTURA + collassi codice ATLAS con/senza descrizione
//    (DIS00N, S-MR-002, S-AI-022). Per i filtri del modulo Performance e per l'IDENTITÀ del dedup
//    (`allineaAttivitaQualsiasi`, chiave in-memory) — NON tocca lo storage. Nota: le forme lunghe
//    ATLAS ESISTONO in `acea_attivita_alias` (stesso macrogruppo del bare), quindi il collasso
//    sarebbe produzione-safe anche in scrittura; resta in lettura solo per stabilità dello storage.
//
// INVARIANTE (tassonomia.test.ts): ogni canonica è un literal di tassonomia (seed 20260720150000)
// e ha lo STESSO gruppo della variante. Nessuna variante è ambigua tra committenti
// (aliasAttivita.test.ts), così il collasso committente-agnostico del dedup converge.

// `${committenteEquivalente}|${normVariante}` → normCanonica
const ALIAS_SCRITTURA: Record<string, string> = {
  // Acea — famiglia Limitazioni Massive (canonico = literal ancorato dall'export; in acea_attivita_alias).
  // Tutte le varianti sono la stessa attività (voce 10 in acea_attivita_alias); la canonica
  // 'LIMITAZIONI MASSIVE' è l'unica riga di catalogo attiva (migration 20260722140000).
  'acea|LIMITAZIONE MASSIVA': 'LIMITAZIONI MASSIVE',
  'acea|LIMITAZIONE MASSIVA SU IMPIANTO': 'LIMITAZIONI MASSIVE',
  'acea|LIMITAZIONI MASSICE': 'LIMITAZIONI MASSIVE', // typo
  // Italgas — apostrofo iniziale (la canonica è in acea_attivita_alias)
  "italgas|'UT MOROSITA' PRIMO PASSAGGIO": "UT MOROSITA' PRIMO PASSAGGIO",
};

// Solo lettura: stesso codice ATLAS con/senza descrizione. Le forme lunghe non sono nel listino.
const ALIAS_SOLO_LETTURA: Record<string, string> = {
  'italgas|DIS00N': 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO',
  "italgas|S-MR-002": "S-MR-002 - RIATTIVAZ. SERVIZIO SOSPESO PER MOROSITA'",
  'italgas|S-AI-022': 'S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA',
};

const ALIAS_LETTURA: Record<string, string> = { ...ALIAS_SCRITTURA, ...ALIAS_SOLO_LETTURA };

export type ModoAllineamento = 'lettura' | 'scrittura';

/** Riscrive la chiave normalizzata nella forma canonica del tier richiesto (o la lascia invariata). */
export function allineaChiaveAttivita(committenteEq: string, norm: string, modo: ModoAllineamento = 'lettura'): string {
  const mappa = modo === 'scrittura' ? ALIAS_SCRITTURA : ALIAS_LETTURA;
  return mappa[`${committenteEq}|${norm}`] ?? norm;
}

// Variante norm → canonica, committente-agnostica, TIER LETTURA COMPLETO (massive + UT + ATLAS).
// Usata dal dedup identitaIntervento (che non ha il committente e non persiste la chiave): deve
// far convergere QUALSIASI forma memorizzata dello stesso lavoro — comprese le forme lunghe ATLAS
// (literal validi di tassonomia, scrivibili via import della forma lunga o riscrittura da editor
// voce) e le varianti massive. Sicura perché nessuna variante è ambigua tra committenti (test).
const ALIAS_QUALSIASI: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [k, v] of Object.entries(ALIAS_LETTURA)) m[k.slice(k.indexOf('|') + 1)] = v;
  return m;
})();

export function allineaAttivitaQualsiasi(norm: string): string {
  return ALIAS_QUALSIASI[norm] ?? norm;
}

/** Mappe alias esposte per i test (invariante gruppo + no-ambiguità). */
export const ALIAS_ATTIVITA = ALIAS_LETTURA;
export const ALIAS_ATTIVITA_SCRITTURA = ALIAS_SCRITTURA;
