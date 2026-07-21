// PURA: alias curati che allineano descrizioni attività "fuorvianti" alla forma canonica
// presente in tassonomia. Chiave e valore sono FORME NORMALIZZATE (come `chiaveTassonomia`:
// maiuscolo, senza accenti, spazi collassati).
//
// DUE tier, applicati da `risolviGruppo(..., { allinea })`, distinti per SICUREZZA a valle:
//
//  - SCRITTURA (`allinea:'scrittura'`): applicati sia in lettura sia nei write-path (import,
//    taskToIntervento, manuali). Solo casi in cui la canonica è compatibile con TUTTI i
//    consumatori del testo grezzo: esiste in `acea_attivita_alias` (listino produzione) e non
//    rompe il dedup (identitaIntervento è reso alias-aware, vedi planInterventiForPiano).
//    Copre typo/punteggiatura e il singolare→plurale della famiglia massive.
//
//  - LETTURA (`allinea:'lettura'`): SCRITTURA + collassi codice ATLAS con/senza descrizione
//    (DIS00N, S-MR-002, S-AI-022). SOLO per i filtri del modulo Performance: le forme lunghe
//    NON sono in `acea_attivita_alias`, quindi non vanno MAI scritte (romperebbero il listino).
//
// INVARIANTE (tassonomia.test.ts): ogni canonica è un literal di tassonomia (seed 20260720150000)
// e ha lo STESSO gruppo della variante. Nessuna variante di SCRITTURA è ambigua tra committenti
// (aliasAttivita.test.ts), così il dedup committente-agnostico (`allineaScritturaQualsiasi`) converge.

// `${committenteEquivalente}|${normVariante}` → normCanonica
const ALIAS_SCRITTURA: Record<string, string> = {
  // Acea — famiglia Limitazioni Massive (canonico = literal ancorato dall'export; in acea_attivita_alias)
  'acea|LIMITAZIONE MASSIVA': 'LIMITAZIONI MASSIVE',
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

// Variante norm → canonica SCRITTURA, committente-agnostica: usata dal dedup identitaIntervento
// (che non ha il committente) per far convergere righe vecchie (grezze) e nuove (allineate).
const ALIAS_SCRITTURA_QUALSIASI: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [k, v] of Object.entries(ALIAS_SCRITTURA)) m[k.slice(k.indexOf('|') + 1)] = v;
  return m;
})();

export function allineaScritturaQualsiasi(norm: string): string {
  return ALIAS_SCRITTURA_QUALSIASI[norm] ?? norm;
}

/** Mappe alias esposte per i test (invariante gruppo + no-ambiguità). */
export const ALIAS_ATTIVITA = ALIAS_LETTURA;
export const ALIAS_ATTIVITA_SCRITTURA = ALIAS_SCRITTURA;
