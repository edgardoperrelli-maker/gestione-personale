import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveTassonomia } from '@/lib/attivita/tassonomia';
import type { Committente, RigaListino } from './tipi';

// Caricamento dell'anagrafica commesse, condiviso dalle tre viste del modulo
// (§7bis: Commesse / Prezzi / Attività sono viste di modulo, non filtri di dato).
// Sta qui e non nelle page.tsx perché le tre viste leggono gli stessi dati e la
// landing ne conta le righe: una sola definizione, nessuna query che diverge.

/** Attività del committente (gruppo + descrizioni) con il flusso operatore che la copre. */
export type AttivitaContratto = {
  gruppo: string;
  descrizioni: string[];
  /** Nome del flusso di Azioni operatori agganciato al gruppo; null = nessuno. */
  flusso: string | null;
};

type TassonomiaRiga = { committente: string; descrizione: string; gruppo: string; attivo: boolean };
type TemplateRiga = { nome: string; gruppo_committente: string | null; gruppi_attivita: string[] | null; active: boolean };

const SELECT_COMMITTENTI =
  'id, nome, codice, attivo, contratti(id, committente_id, nome, valido_dal, valido_al, attivo, note, territori:contratto_territori(id, contratto_id, nome, territory_id, attivo))';

export async function caricaCommittenti(): Promise<Committente[]> {
  const { data } = await supabaseAdmin.from('committenti').select(SELECT_COMMITTENTI).order('nome');
  return (data ?? []) as unknown as Committente[];
}

export async function caricaListino(): Promise<RigaListino[]> {
  const { data } = await supabaseAdmin
    .from('listino')
    .select('id, contratto_id, attivita, etichetta, azione_chiave, prezzo, valido_dal, valido_al, attivo, note')
    .not('contratto_id', 'is', null)
    .order('etichetta');
  return (data ?? []) as RigaListino[];
}

export async function caricaTerritoriMaster(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabaseAdmin.from('territories').select('id, name').order('name');
  return (data ?? []) as { id: string; name: string }[];
}

/**
 * Attività per codice committente. Le righe vengono da `attivita_tassonomia` — il
 * contratto non ne tiene copia: una sola fonte di verità per import e classificazione.
 * A ogni gruppo si affianca il flusso di Azioni operatori che lo copre, con la STESSA
 * risoluzione della consolle: è così che si vede a colpo d'occhio un'attività orfana.
 */
export async function caricaAttivitaPerCodice(): Promise<Record<string, AttivitaContratto[]>> {
  const [tassonomiaRes, templatesRes] = await Promise.all([
    supabaseAdmin.from('attivita_tassonomia').select('committente, descrizione, gruppo, attivo').range(0, 4999),
    supabaseAdmin.from('rapportino_template').select('nome, gruppo_committente, gruppi_attivita, active'),
  ]);
  const tassonomia = (tassonomiaRes.data ?? []) as TassonomiaRiga[];
  const templates = (templatesRes.data ?? []) as TemplateRiga[];

  const out = new Map<string, Map<string, AttivitaContratto>>();
  for (const r of tassonomia) {
    if (!r.attivo) continue;
    const perCodice = out.get(r.committente) ?? new Map<string, AttivitaContratto>();
    const k = chiaveTassonomia(r.gruppo);
    const nodo = perCodice.get(k) ?? { gruppo: r.gruppo, descrizioni: [], flusso: null };
    nodo.descrizioni.push(r.descrizione);
    perCodice.set(k, nodo);
    out.set(r.committente, perCodice);
  }
  for (const [codice, gruppi] of out) {
    for (const [k, nodo] of gruppi) {
      const coperto = templates.find(
        (t) => t.active && t.gruppo_committente === codice
          && (t.gruppi_attivita ?? []).some((g) => chiaveTassonomia(g) === k),
      );
      nodo.flusso = coperto?.nome ?? null;
      nodo.descrizioni.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    }
  }
  return Object.fromEntries(
    [...out].map(([codice, gruppi]) => [
      codice,
      [...gruppi.values()].sort((a, b) => a.gruppo.localeCompare(b.gruppo, 'it', { sensitivity: 'base' })),
    ]),
  );
}

/** Quante attività del contratto non hanno un flusso operatore: il numero da sorvegliare. */
export function contaSenzaFlusso(perCodice: Record<string, AttivitaContratto[]>): number {
  return Object.values(perCodice).flat().filter((a) => !a.flusso).length;
}
