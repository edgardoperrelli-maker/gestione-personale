// lib/interventi/taskDellaVoce.ts
// PURA: quale task del piano appartiene a una voce di rapportino.
//
// Serve alla ricostruzione degli interventi orfani (`ricostruisciOrfani.ts`): il task e` la
// fonte di verita` da cui l'intervento rinasce, e sbagliare task significa scrivere l'esito sul
// contatore di un altro. Sta a parte perche' la` intorno c'e` I/O, e questa regola si prova da
// sola.

import type { Task } from '@/utils/routing/types';

/** Chiave con cui la voce ritrova il proprio task fra quelli dell'operatore. */
const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Il task di questa voce fra quelli dell'operatore.
 *
 * Prima per `task_id` — che e` l'id del task nel file (`row-N`) e su un singolo piano-operatore
 * e` univoco — poi per ODL, che copre le voci il cui `task_id` non e` piu` allineato.
 */
export function taskDellaVoce(
  tasks: readonly Task[],
  voce: { task_id?: string | null; odl?: string | null },
): Task | null {
  const tid = String(voce.task_id ?? '').trim();
  if (tid !== '') {
    const perId = tasks.find((t) => String((t as { id?: unknown }).id ?? '').trim() === tid);
    if (perId) return perId;
  }
  const odl = norm(voce.odl);
  if (odl === '') return null;
  const perOdl = tasks.filter((t) => norm(t.odl) === odl);
  // Solo a scelta OBBLIGATA: due task con lo stesso ODL nello stesso giro sono due misuratori
  // diversi, e prenderne uno a caso scriverebbe l'esito sul contatore sbagliato.
  return perOdl.length === 1 ? perOdl[0] : null;
}
