// lib/interventi/taskRendicontati.ts
// PURA: le due guardie che permettono al motore Mappa di rigenerare un piano che ospita
// lavoro della commessa (voci `origine='acea'`, task `acea:*`) senza produrre doppioni.
//
//  G1 (`filtraTaskRendicontati`): nel costruire le voci da task, salta i task già coperti da
//  una voce SUPERSTITE dello stesso rapportino (origine ≠ 'task': acea o manuale). Con i task
//  della commessa il match è esatto — `Task.id = taskIdAcea(interventoId)` coincide con il
//  `task_id` della voce acea — e l'unità ODL(+matricola) fa da cintura per il periodo di
//  transizione (voci acea storiche vs task Excel dello stesso ODL).
//
//  G2 (`tuttiTaskRendicontatiAltrove`): prima di CREARE un rapportino nuovo per un operatore,
//  se tutti i suoi task sono `acea:*` già rendicontati in un altro rapportino dello stesso
//  operatore nello stesso giorno (il rapportino "misto" Italgas+commessa), il rapportino non
//  si crea: la regola «un rapportino per operatore per giorno» vive nel motore commessa e la
//  Mappa non deve romperla. Ristretta al prefisso `acea:` perché solo quegli id sono
//  globalmente unici (i task Excel `row-N` si ripetono fra piani diversi).

import { normOdl } from '@/lib/interventi/odlPositivi';

export type VoceAltrui = {
  task_id?: string | null;
  odl?: string | null;
  matricola?: string | null;
};

export type TaskDaFiltrare = {
  id?: unknown;
  odl?: string | null;
  matricola?: string | null;
};

/** Matricola normalizzata per il confronto (stessa regola di vociRapportino): '' se assente. */
const normMatricola = (m: string | null | undefined): string =>
  String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * I task NON ancora rendicontati da una voce altrui (origine ≠ 'task') dello stesso rapportino.
 *
 * Match, in ordine di robustezza:
 *  - `task_id` esatto (i task della commessa hanno l'id della loro voce acea);
 *  - unità ODL(+matricola): stesso ODL normalizzato E matricole uguali quando entrambe
 *    presenti. Una matricola assente da una delle due parti → decide l'ODL da solo (ACEA,
 *    dove l'unità è l'ODL); con entrambe presenti e diverse il task RESTA — su AcquaLatina
 *    cinque contatori dello stesso ODL sono cinque voci, non un doppione.
 */
export function filtraTaskRendicontati<T extends TaskDaFiltrare>(
  tasks: readonly T[],
  vociAltrui: readonly VoceAltrui[],
): T[] {
  if (vociAltrui.length === 0) return [...tasks];
  const taskIds = new Set<string>();
  const matricolePerOdl = new Map<string, Set<string>>();
  for (const v of vociAltrui) {
    const tid = String(v.task_id ?? '');
    if (tid) taskIds.add(tid);
    const o = normOdl(v.odl ?? null);
    if (!o) continue;
    const set = matricolePerOdl.get(o) ?? new Set<string>();
    set.add(normMatricola(v.matricola));
    matricolePerOdl.set(o, set);
  }
  return tasks.filter((t) => {
    const id = String(t.id ?? '');
    if (id && taskIds.has(id)) return false;
    const o = normOdl(t.odl ?? null);
    if (!o) return true;
    const matricole = matricolePerOdl.get(o);
    if (!matricole) return true;
    const m = normMatricola(t.matricola);
    // '' da una delle due parti = quella fonte non distingue le matricole: l'ODL basta.
    return !(m === '' || matricole.has('') || matricole.has(m));
  });
}

/**
 * `true` se l'operatore non ha NIENTE da rendicontare su questo piano: tutti i suoi task sono
 * `acea:*` e ognuno ha già una voce in un altro rapportino suo dello stesso giorno. Un solo
 * task Excel (`row-N`) o un solo `acea:*` scoperto bastano a richiedere il rapportino.
 */
export function tuttiTaskRendicontatiAltrove(
  tasks: readonly TaskDaFiltrare[],
  taskIdsAltrove: ReadonlySet<string>,
): boolean {
  if (tasks.length === 0) return false;
  return tasks.every((t) => {
    const id = String(t.id ?? '');
    return id.startsWith('acea:') && taskIdsAltrove.has(id);
  });
}
