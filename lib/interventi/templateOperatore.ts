// lib/interventi/templateOperatore.ts
// PURA: il flusso prevalente fra i task di UN operatore (o di un piano), per la scelta del
// modello di testata del SUO rapportino.
//
// Nato dal piano misto PERUGIA del 2026-08-17: 4 operatori con soli task BONIFICHE EXTRA e 3
// con attività Italgas classiche. Il modello si risolveva contando i flussi su TUTTI i task del
// piano, e il flusso task-via (27 task contro 25) finiva in testata anche ai rapportini degli
// operatori Italgas — dove `task_via = true` trasformava OGNI voce in un contenitore bonifica.
// La conta va fatta sui task dell'operatore, e un flusso task-via non deve mai vincere su un
// giro che contiene anche lavoro classico.
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import { risolviFlussoDaTask, type TaskClassificabile } from '@/lib/rapportini/flussoDaTask';
import type { TassonomiaRiga } from '@/lib/attivita/tassonomia';
import type { TemplateFlussoRow } from '@/lib/rapportini/flussiGruppo';

/**
 * Il flusso più rappresentato fra i task che sanno classificarsi. A pari merito decide l'id,
 * per determinismo (stesso criterio del motore ACEA).
 *
 * I task BONIFICHE EXTRA (contenitori a sola via) NON concorrono finché c'è anche lavoro
 * classico: le loro voci si riconoscono da sole per attività e non hanno bisogno che la
 * testata sia task-via, mentre una testata task-via mette il contenitore addosso a tutto il
 * resto. Solo un giro FATTO SOLO di bonifiche prende il flusso task-via in testata.
 */
export function flussoPrevalente<T extends TemplateFlussoRow & { nome?: string | null }>(
  tasks: TaskClassificabile[],
  tassIndex: Map<string, TassonomiaRiga>,
  flussi: T[],
): string | null {
  const conta = (ts: TaskClassificabile[]): string | null => {
    const conteggi = new Map<string, number>();
    for (const t of ts) {
      const f = risolviFlussoDaTask(t, tassIndex, flussi);
      if (f) conteggi.set(f.id, (conteggi.get(f.id) ?? 0) + 1);
    }
    return [...conteggi.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  };
  const classici = tasks.filter((t) => !isTaskVia(t));
  return conta(classici) ?? conta(tasks);
}
