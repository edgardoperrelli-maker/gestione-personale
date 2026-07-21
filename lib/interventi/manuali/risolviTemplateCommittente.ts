// PURA: dato il committente e la lista template, ritorna l'id del template da usare.
// Solo il match ESATTO di committente: il fallback su is_default è stato ritirato con
// le Azioni operatori (nessun template è più "default"). Senza match il chiamante
// eredita i campi standard del rapportino, che è il comportamento voluto.
import type { CommittenteManuale } from './types';

export type TemplateRow = {
  id: string;
  committente: string | null;
  active: boolean;
  solo_manuale?: boolean | null;
  foto_id_priority?: string[] | null;
};

export function risolviTemplateCommittente(
  committente: CommittenteManuale,
  templates: TemplateRow[],
): string | null {
  const attivi = templates.filter((t) => t.active);
  const esatto = attivi.find((t) => t.committente === committente);
  return esatto ? esatto.id : null;
}
