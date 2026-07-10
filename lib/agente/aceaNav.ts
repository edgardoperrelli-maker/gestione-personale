// lib/agente/aceaNav.ts — PURO: label e segmenti del breadcrumb per l'hub Assegnazioni AI.
export type NavState = { commessa: string | null; attivita: string | null; azione: string | null };

export const COMMESSA_LABEL: Record<string, string> = { acea: 'ACEA' };
export const ATTIVITA_LABEL: Record<string, string> = { lm: 'Limitazioni massive', dunning: 'Dunning' };
export const AZIONE_LABEL: Record<string, string> = {
  'aggiorna-odl': 'Aggiorna ODL',
  'aggiorna-stato': 'Aggiorna stato/rapportino',
  assegna: 'Assegna ODL',
  'assegna-interventi': 'Assegna interventi',
  sincronizza: 'Sincronizza rapportini',
};

export type Segment = { level: 'commessa' | 'attivita' | 'azione'; key: string; label: string };

export function breadcrumbSegments(nav: NavState): Segment[] {
  const out: Segment[] = [];
  if (nav.commessa) out.push({ level: 'commessa', key: nav.commessa, label: COMMESSA_LABEL[nav.commessa] ?? nav.commessa });
  if (nav.attivita) out.push({ level: 'attivita', key: nav.attivita, label: ATTIVITA_LABEL[nav.attivita] ?? nav.attivita });
  if (nav.azione) out.push({ level: 'azione', key: nav.azione, label: AZIONE_LABEL[nav.azione] ?? nav.azione });
  return out;
}
