// Committenti e territori DEGLI APPUNTAMENTI (dimensione separata dal master
// territori della mappa). Vedi migrazione 20260724000000_appuntamenti_committenti.

export type AppuntamentoTerritorio = {
  id: string;
  committente_id: string;
  nome: string;
  attivo: boolean;
};

export type AppuntamentoCommittente = {
  id: string;
  nome: string;
  attivo: boolean;
  territori: AppuntamentoTerritorio[];
};

/**
 * Colore della banda-calendario per un committente. Deriva un indice stabile dal
 * suo id (o nome, per i dati non ancora salvati) sulla scala categorica sobria
 * `--chart-1..8` di DESIGN.md §3 — così ogni committente ha SEMPRE lo stesso
 * colore e non ne servono di cablati né una colonna dedicata. Ritorna un
 * `var(--chart-N)`, che segue il tema al volo (i token cambiano fra chiaro e
 * scuro senza ri-render).
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

/** Territori attivi di un committente, ordinati per nome (per i selettori). */
export function territoriAttivi(committente: AppuntamentoCommittente | null | undefined): AppuntamentoTerritorio[] {
  if (!committente) return [];
  return committente.territori
    .filter((t) => t.attivo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
}

/** Committenti attivi ordinati per nome. */
export function committentiAttivi(committenti: AppuntamentoCommittente[]): AppuntamentoCommittente[] {
  return committenti
    .filter((c) => c.attivo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
}
