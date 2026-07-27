import { supabaseAdmin } from '@/lib/supabaseAdmin';
import ContrattiClient from './ContrattiClient';
import type { Committente, RigaListino } from '@/lib/contratti/tipi';
import { chiaveTassonomia } from '@/lib/attivita/tassonomia';

export const dynamic = 'force-dynamic';

/** Attività del committente (gruppo + descrizioni) con il flusso operatore che le copre. */
export type AttivitaContratto = {
  gruppo: string;
  descrizioni: string[];
  /** Nome del flusso di Azioni operatori agganciato al gruppo; null = nessuno. */
  flusso: string | null;
};

type TassonomiaRiga = { committente: string; descrizione: string; gruppo: string; attivo: boolean };
type TemplateRiga = { nome: string; gruppo_committente: string | null; gruppi_attivita: string[] | null; active: boolean };

/**
 * Attività per codice committente. Le righe vengono da `attivita_tassonomia` — il
 * contratto non ne tiene copia: una sola fonte di verità per import e classificazione.
 */
function attivitaPerCommittente(
  tassonomia: TassonomiaRiga[],
  templates: TemplateRiga[],
): Map<string, AttivitaContratto[]> {
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
  // Aggancio al flusso: stessa risoluzione della consolle Azioni operatori.
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
  return new Map(
    [...out].map(([codice, gruppi]) => [
      codice,
      [...gruppi.values()].sort((a, b) => a.gruppo.localeCompare(b.gruppo, 'it', { sensitivity: 'base' })),
    ]),
  );
}

export default async function ContrattiPage() {
  const [committentiRes, listinoRes, tassonomiaRes, templatesRes, territoriesRes] = await Promise.all([
    // Embed delle relazioni FK: committenti → contratti → contratto_territori.
    supabaseAdmin
      .from('committenti')
      .select(
        'id, nome, codice, attivo, contratti(id, committente_id, nome, valido_dal, valido_al, attivo, note, territori:contratto_territori(id, contratto_id, nome, territory_id, attivo))',
      )
      .order('nome'),
    supabaseAdmin
      .from('listino')
      .select('id, contratto_id, attivita, etichetta, azione_chiave, prezzo, valido_dal, valido_al, attivo, note')
      .not('contratto_id', 'is', null)
      .order('etichetta'),
    supabaseAdmin.from('attivita_tassonomia').select('committente, descrizione, gruppo, attivo').range(0, 4999),
    supabaseAdmin.from('rapportino_template').select('nome, gruppo_committente, gruppi_attivita, active'),
    supabaseAdmin.from('territories').select('id, name').order('name'),
  ]);

  const attivita = attivitaPerCommittente(
    (tassonomiaRes.data ?? []) as TassonomiaRiga[],
    (templatesRes.data ?? []) as TemplateRiga[],
  );

  return (
    <ContrattiClient
      initial={(committentiRes.data ?? []) as unknown as Committente[]}
      listino={(listinoRes.data ?? []) as RigaListino[]}
      attivitaPerCodice={Object.fromEntries(attivita)}
      territories={(territoriesRes.data ?? []) as { id: string; name: string }[]}
      oggi={new Date().toISOString().slice(0, 10)}
    />
  );
}
