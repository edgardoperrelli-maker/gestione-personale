// PURA: alias curati che allineano descrizioni attività "fuorvianti" alla forma canonica
// presente in tassonomia. Chiave e valore sono FORME NORMALIZZATE (come `chiaveTassonomia`:
// maiuscolo, senza accenti, spazi collassati).
//
// DUE tier, applicati da `risolviGruppo(..., { allinea })`, distinti per SICUREZZA a valle:
//
//  - SCRITTURA (`allinea:'scrittura'`): applicati nei write-path (import, taskToIntervento,
//    manuali), quindi cambiano il TESTO MEMORIZZATO. Solo casi genuinamente da correggere
//    allo storage: typo/punteggiatura e la famiglia massive (canonica unica).
//
//  - LETTURA (`allinea:'lettura'`): SCRITTURA + collasso delle famiglie di codici italgas al
//    codice nudo (DIS00N, S-AI-022, S-MR-002/003, S-PR-001/003/004/007/009/019/077 con le loro
//    varianti A/B/C, Sonda, GN, forma lunga). NON tocca lo storage: il dettaglio va conservato
//    per l'import dal file del committente e per l'export/riconciliazione; la UI lo mostra
//    unificato via `attivitaUnificataDisplay` + questo tier (Performance/dedup). Sicuro perché
//    italgas non è valorizzato e i flussi dipendono dal gruppo, non dal codice.
//
// INVARIANTE (tassonomia.test.ts): ogni canonica è un literal di tassonomia attivo e ha lo
// STESSO gruppo della variante. Nessuna variante è ambigua tra committenti
// (aliasAttivita.test.ts), così il collasso committente-agnostico del dedup converge.

// `${committenteEquivalente}|${normVariante}` → normCanonica
const ALIAS_SCRITTURA: Record<string, string> = {
  // Acea — famiglia Limitazioni Massive → unica canonica (migration 20260722140000).
  'acea|LIMITAZIONE MASSIVA': 'LIMITAZIONI MASSIVE',
  'acea|LIMITAZIONE MASSIVA SU IMPIANTO': 'LIMITAZIONI MASSIVE',
  'acea|LIMITAZIONI MASSICE': 'LIMITAZIONI MASSIVE', // typo
  // Italgas — apostrofo iniziale
  "italgas|'UT MOROSITA' PRIMO PASSAGGIO": "UT MOROSITA' PRIMO PASSAGGIO",
};

// Solo lettura: le famiglie di codici italgas collassano al codice nudo per dedup/Performance/
// display, MA lo storage conserva il dettaglio (import committente + export). Migration
// 20260723090000 (re-divisione dello storage).
const ALIAS_SOLO_LETTURA: Record<string, string> = {
  'italgas|DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO': 'DIS00N',

  'italgas|S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA': 'S-AI-022',
  'italgas|S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA GN B': 'S-AI-022',
  'italgas|S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA GN C': 'S-AI-022',

  "italgas|S-MR-002 - RIATTIVAZ. SERVIZIO SOSPESO PER MOROSITA'": 'S-MR-002',
  'italgas|S-MR-002 A': 'S-MR-002',
  'italgas|S-MR-002 A SONDA': 'S-MR-002',
  'italgas|S-MR-002 B': 'S-MR-002',
  'italgas|S-MR-002 C': 'S-MR-002',

  'italgas|S-MR-003 A': 'S-MR-003',
  'italgas|S-MR-003 A SONDA': 'S-MR-003',

  'italgas|S-PR-001 A': 'S-PR-001',

  'italgas|S-PR-003 A': 'S-PR-003',
  'italgas|S-PR-003 A SONDA': 'S-PR-003',
  'italgas|S-PR-003 B': 'S-PR-003',

  'italgas|S-PR-004 A': 'S-PR-004',
  'italgas|S-PR-004 B': 'S-PR-004',
  'italgas|S-PR-004 C': 'S-PR-004',

  'italgas|S-PR-007 A': 'S-PR-007',
  'italgas|S-PR-007 B': 'S-PR-007',

  'italgas|S-PR-009 A': 'S-PR-009',
  'italgas|S-PR-009 B': 'S-PR-009',
  'italgas|S-PR-009 C': 'S-PR-009',

  'italgas|S-PR-019 A': 'S-PR-019',
  'italgas|S-PR-019 B': 'S-PR-019',

  'italgas|S-PR-077 A': 'S-PR-077',
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
// far convergere QUALSIASI forma memorizzata dello stesso lavoro. Sicura perché nessuna variante
// è ambigua tra committenti (test).
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
