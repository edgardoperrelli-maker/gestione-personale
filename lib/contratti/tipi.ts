// PURA: anagrafica delle commesse — committenti 1—N contratti 1—N territori.
// Vedi migrazione 20260727140000_contratti.sql.
//
// Il CONTRATTO è la commessa: nome, validità, territori di copertura, listino. Le
// ATTIVITÀ non vivono qui: sono le righe di `attivita_tassonomia` del committente
// (unica fonte di verità per import, classificazione e Azioni operatori), risolte
// tramite `Committente.codice`.

/** Territorio di copertura: comune/zona, con aggancio opzionale al master `territories`. */
export type ContrattoTerritorio = {
  id: string;
  contratto_id: string;
  nome: string;
  /** Territorio di pianificazione (cronoprogramma/mappa) corrispondente, se esiste. */
  territory_id: string | null;
  attivo: boolean;
};

export type Contratto = {
  id: string;
  committente_id: string;
  nome: string;
  valido_dal: string | null;
  valido_al: string | null;
  attivo: boolean;
  note: string | null;
  territori: ContrattoTerritorio[];
};

export type Committente = {
  id: string;
  nome: string;
  /** Chiave di runtime ('acea' | 'italgas' | 'acqualatina'); null = nessuna lavorazione a sistema. */
  codice: string | null;
  attivo: boolean;
  contratti: Contratto[];
};

/** Riga di listino: tariffa di un'attività del contratto, o di un suo extra. */
export type RigaListino = {
  id: string;
  contratto_id: string | null;
  attivita: string | null;
  etichetta: string | null;
  /** Chiave dell'azione del rapportino che fattura l'extra; null = voce base. */
  azione_chiave: string | null;
  prezzo: number;
  valido_dal: string;
  valido_al: string | null;
  attivo: boolean;
  note: string | null;
};

const perNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' });

/** Territori attivi di un contratto, ordinati per nome (per i selettori). */
export function territoriAttivi(contratto: Contratto | null | undefined): ContrattoTerritorio[] {
  return (contratto?.territori ?? []).filter((t) => t.attivo).sort(perNome);
}

/** Contratti attivi di un committente, ordinati per nome. */
export function contrattiAttivi(committente: Committente | null | undefined): Contratto[] {
  return (committente?.contratti ?? []).filter((k) => k.attivo).sort(perNome);
}

/**
 * Tutti i territori coperti da un committente: l'unione di quelli dei suoi contratti
 * attivi, deduplicati per nome. Serve a chi ragiona per committente e non per commessa
 * (il modulo Appuntamenti), che della gerarchia intermedia non ha bisogno.
 */
export function territoriDelCommittente(
  committente: Committente | null | undefined,
): ContrattoTerritorio[] {
  const visti = new Map<string, ContrattoTerritorio>();
  for (const k of contrattiAttivi(committente)) {
    for (const t of territoriAttivi(k)) {
      const chiave = t.nome.trim().toLowerCase();
      if (!visti.has(chiave)) visti.set(chiave, t);
    }
  }
  return [...visti.values()].sort(perNome);
}

/** Committenti attivi ordinati per nome. */
export function committentiAttivi(committenti: Committente[]): Committente[] {
  return (committenti ?? []).filter((c) => c.attivo).sort(perNome);
}

/**
 * Un contratto è IN CORSO a una certa data se è attivo e la data cade nella validità.
 * Estremi inclusi; `null` su un estremo = aperto da quel lato.
 */
export function contrattoInCorso(contratto: Contratto, isoOggi: string): boolean {
  if (!contratto.attivo) return false;
  if (contratto.valido_dal && isoOggi < contratto.valido_dal) return false;
  if (contratto.valido_al && isoOggi > contratto.valido_al) return false;
  return true;
}

/** Stato leggibile del contratto rispetto a oggi (per i badge della scheda). */
export function statoContratto(
  contratto: Contratto,
  isoOggi: string,
): 'in-corso' | 'futuro' | 'scaduto' | 'sospeso' {
  if (!contratto.attivo) return 'sospeso';
  if (contratto.valido_dal && isoOggi < contratto.valido_dal) return 'futuro';
  if (contratto.valido_al && isoOggi > contratto.valido_al) return 'scaduto';
  return 'in-corso';
}

/**
 * Colore della banda-calendario di un committente. Deriva un indice stabile dalla
 * chiave (id, o nome per i dati non ancora salvati) sulla scala categorica sobria
 * `--chart-1..8` di DESIGN.md §3 — così ogni committente ha SEMPRE lo stesso colore
 * senza cablarne nessuno né aggiungere una colonna. Il token segue il tema al volo.
 */
export function coloreCommittente(chiave: string | null | undefined): string {
  const s = (chiave ?? '').trim();
  if (!s) return 'var(--chart-7)'; // grigio ardesia: nessun committente
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `var(--chart-${(h % 8) + 1})`;
}

/**
 * Tariffa applicabile a una data: fra le righe attive della stessa chiave vince quella
 * con `valido_dal` più recente non successivo alla data. Nessuna riga valida → null.
 */
export function tariffaAllaData(
  righe: RigaListino[],
  isoData: string,
): RigaListino | null {
  const valide = (righe ?? []).filter(
    (r) => r.attivo && r.valido_dal <= isoData && (!r.valido_al || r.valido_al >= isoData),
  );
  if (valide.length === 0) return null;
  return valide.reduce((best, r) => (r.valido_dal > best.valido_dal ? r : best));
}
