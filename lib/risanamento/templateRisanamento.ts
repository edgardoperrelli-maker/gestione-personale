/** Nome dell'attività che identifica un intervento di risanamento colonne. */
export const ATTIVITA_RISANAMENTO = 'RESINE';

/** True se l'attività indica risanamento (case-insensitive, trim). */
export function isAttivitaRisanamento(attivita: unknown): boolean {
  return String(attivita ?? '').trim().toUpperCase() === ATTIVITA_RISANAMENTO;
}

/** True se almeno un task del piano ha attività di risanamento. */
export function pianoHaRisanamento(tasks: Array<{ attivita?: string | null }>): boolean {
  return Array.isArray(tasks) && tasks.some((t) => isAttivitaRisanamento(t?.attivita));
}

/** Primo template attivo con tipo='risanamento' (ordine per nome IT), o null. */
export function risolviTemplateRisanamento(
  templates: Array<{ id: string; tipo?: string | null; active?: boolean; nome: string }>,
): string | null {
  const cand = templates
    .filter((t) => t.tipo === 'risanamento' && t.active !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  return cand[0]?.id ?? null;
}
