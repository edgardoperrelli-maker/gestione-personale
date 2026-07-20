// PURA: albero del modulo "Azioni operatori" — la gerarchia del flowchart ATLAS
// COMMITTENTE -> GRUPPO ATTIVITA' -> FLUSSO (rapportino_template collegato).
// I gruppi arrivano dalla tassonomia attiva (attivita_tassonomia) più le foglie extra
// dei flussi che non importano attività (acqualatina / SOSTITUZIONE MISURATORI).
import { chiaveTassonomia, committenteEquivalente } from '@/lib/attivita/tassonomia';

export const COMMITTENTI_FLUSSO = ['italgas', 'acea', 'acqualatina'] as const;
export type CommittenteFlusso = (typeof COMMITTENTI_FLUSSO)[number];

export const COMMITTENTE_FLUSSO_LABEL: Record<CommittenteFlusso, string> = {
  italgas: 'Italgas',
  acea: 'Acea',
  acqualatina: 'Acqualatina',
};

/** Foglie del flowchart senza righe di tassonomia (il flusso non importa attività). */
export const GRUPPI_EXTRA: Record<CommittenteFlusso, readonly string[]> = {
  italgas: [],
  acea: [],
  acqualatina: ['SOSTITUZIONE MISURATORI'],
};

export type TassonomiaGruppoRiga = { committente: string; gruppo: string; attivo: boolean };

export type TemplateFlussoRow = {
  id: string;
  solo_manuale?: boolean | null;
  committente?: string | null;
  gruppo_committente?: string | null;
  gruppi_attivita?: string[] | null;
};

export type GruppoNodo<T> = { gruppo: string; flussi: T[] };

export type CommittenteNodo<T> = {
  committente: CommittenteFlusso;
  label: string;
  gruppi: GruppoNodo<T>[];
  /** Modelli del "+" operatore (solo_manuale) del committente, non collegati a un gruppo. */
  manuali: T[];
};

export type AlberoFlussi<T> = { committenti: CommittenteNodo<T>[]; nonCollegati: T[] };

/** Un template è "collegato" se ha il committente della gerarchia E almeno un gruppo. */
export function templateCollegato(t: TemplateFlussoRow): boolean {
  return Boolean(t.gruppo_committente) && (t.gruppi_attivita?.length ?? 0) > 0;
}

/**
 * Coppia coerente per il DB (check rapportino_template_gruppo_coppia_check):
 * collegato = committente + almeno un gruppo (dedup normalizzato), altrimenti entrambi null.
 */
export function normalizzaCollegamento(input: {
  gruppo_committente?: string | null;
  gruppi_attivita?: string[] | null;
}): { gruppo_committente: string | null; gruppi_attivita: string[] | null } {
  const visti = new Set<string>();
  const gruppi: string[] = [];
  for (const g of input.gruppi_attivita ?? []) {
    const pulito = g.replace(/\s+/g, ' ').trim();
    const k = chiaveTassonomia(pulito);
    if (!k || visti.has(k)) continue;
    visti.add(k);
    gruppi.push(pulito);
  }
  if (!input.gruppo_committente || gruppi.length === 0) {
    return { gruppo_committente: null, gruppi_attivita: null };
  }
  return { gruppo_committente: input.gruppo_committente, gruppi_attivita: gruppi };
}

export function buildAlberoFlussi<T extends TemplateFlussoRow>(
  tassonomia: TassonomiaGruppoRiga[],
  templates: T[],
): AlberoFlussi<T> {
  const committenti = COMMITTENTI_FLUSSO.map((committente) => {
    // Gruppi del committente: chiave normalizzata -> prima forma canonica incontrata.
    const visti = new Map<string, string>();
    const aggiungi = (gruppo: string) => {
      const k = chiaveTassonomia(gruppo);
      if (k && !visti.has(k)) visti.set(k, gruppo);
    };
    for (const r of tassonomia) {
      if (r.attivo && committenteEquivalente(r.committente) === committente) aggiungi(r.gruppo);
    }
    for (const g of GRUPPI_EXTRA[committente]) aggiungi(g);
    // Un collegamento verso un gruppo non (più) in tassonomia resta visibile: mai flussi orfani.
    for (const t of templates) {
      if (t.gruppo_committente !== committente) continue;
      for (const g of t.gruppi_attivita ?? []) aggiungi(g);
    }

    const gruppi: GruppoNodo<T>[] = [...visti.entries()]
      .map(([k, gruppo]) => ({
        gruppo,
        flussi: templates.filter(
          (t) =>
            t.gruppo_committente === committente &&
            (t.gruppi_attivita ?? []).some((g) => chiaveTassonomia(g) === k),
        ),
      }))
      .sort((a, b) => a.gruppo.localeCompare(b.gruppo, 'it', { sensitivity: 'base' }));

    const manuali = templates.filter(
      (t) =>
        Boolean(t.solo_manuale) &&
        !templateCollegato(t) &&
        committenteEquivalente(t.committente) === committente,
    );

    return { committente, label: COMMITTENTE_FLUSSO_LABEL[committente], gruppi, manuali };
  });

  const inManuali = new Set(committenti.flatMap((c) => c.manuali.map((t) => t.id)));
  const nonCollegati = templates.filter((t) => !templateCollegato(t) && !inManuali.has(t.id));

  return { committenti, nonCollegati };
}
