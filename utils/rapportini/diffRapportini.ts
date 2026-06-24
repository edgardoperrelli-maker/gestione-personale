// utils/rapportini/diffRapportini.ts
// Calcolo PURO (nessun I/O) della variazione sui rapportini quando si salva una
// pianificazione dopo aver spostato interventi tra operatori. Ragiona per task_id
// (le voci hanno task_id = String(task.id)).

export type TaskProposto = { taskId: string; descr: string };
export type OperatoreProposto = { staffId: string; staffName: string; tasks: TaskProposto[] };
export type VoceEsistente = { taskId: string; staffId: string; staffName: string; descr: string };

export type DiffInput = {
  /** Distribuzione proposta (operatori ancora in mappa, con i loro task). */
  operatoriProposti: OperatoreProposto[];
  /** Voci attualmente salvate nei rapportini del piano (stato "prima"). */
  vociEsistenti: VoceEsistente[];
  /** staff_id che hanno già un rapportino in questo piano. */
  staffConRapportino: Set<string>;
  /** staff_id il cui rapportino è in stato 'inviato'. */
  staffInviati: Set<string>;
  /** task_id il cui intervento collegato è 'completato' (non riassegnabile). */
  taskCompletati: Set<string>;
};

export type StaffRef = { staffId: string; staffName: string };
export type Spostamento = { taskId: string; descr: string; daStaffId: string; daNome: string; aStaffId: string; aNome: string };
export type Bloccato = { taskId: string; descr: string; daNome: string; aNome: string; motivo: 'completato' };

export type DiffRapportini = {
  nessunaModifica: boolean;
  spostamenti: Spostamento[];
  nuoviLink: StaffRef[];
  svuotati: StaffRef[];
  inviatiCoinvolti: StaffRef[];
  bloccati: Bloccato[];
};

export function calcolaDiffRapportini(input: DiffInput): DiffRapportini {
  // "prima": task_id → voce con lo staff attuale
  const prima = new Map<string, VoceEsistente>();
  for (const v of input.vociEsistenti) prima.set(v.taskId, v);

  // "dopo": task_id → operatore proposto
  const dopo = new Map<string, { staffId: string; staffName: string; descr: string }>();
  for (const op of input.operatoriProposti) {
    for (const t of op.tasks) dopo.set(t.taskId, { staffId: op.staffId, staffName: op.staffName, descr: t.descr });
  }

  const spostamenti: Spostamento[] = [];
  const bloccati: Bloccato[] = [];
  for (const [taskId, d] of dopo) {
    const p = prima.get(taskId);
    if (!p) continue;                      // task mai stato in un rapportino → nuova voce, non spostamento
    if (p.staffId === d.staffId) continue; // stesso operatore → nessun movimento
    if (input.taskCompletati.has(taskId)) {
      bloccati.push({ taskId, descr: p.descr, daNome: p.staffName, aNome: d.staffName, motivo: 'completato' });
    } else {
      spostamenti.push({ taskId, descr: p.descr, daStaffId: p.staffId, daNome: p.staffName, aStaffId: d.staffId, aNome: d.staffName });
    }
  }

  const nuoviLink: StaffRef[] = input.operatoriProposti
    .filter((op) => op.tasks.length > 0 && !input.staffConRapportino.has(op.staffId))
    .map((op) => ({ staffId: op.staffId, staffName: op.staffName }));

  const svuotati: StaffRef[] = input.operatoriProposti
    .filter((op) => op.tasks.length === 0 && input.staffConRapportino.has(op.staffId))
    .map((op) => ({ staffId: op.staffId, staffName: op.staffName }));

  // staff coinvolti da un movimento: origine/destinazione di uno spostamento,
  // oppure destinazione di una voce nuova (task mai visto assegnato a un operatore esistente).
  const staffCoinvolti = new Set<string>();
  for (const sp of spostamenti) { staffCoinvolti.add(sp.daStaffId); staffCoinvolti.add(sp.aStaffId); }
  for (const [taskId, d] of dopo) { if (!prima.has(taskId)) staffCoinvolti.add(d.staffId); }
  const inviatiCoinvolti: StaffRef[] = input.operatoriProposti
    .filter((op) => staffCoinvolti.has(op.staffId) && input.staffInviati.has(op.staffId))
    .map((op) => ({ staffId: op.staffId, staffName: op.staffName }));

  const nessunaModifica =
    spostamenti.length === 0 && nuoviLink.length === 0 && svuotati.length === 0 && bloccati.length === 0;

  return { nessunaModifica, spostamenti, nuoviLink, svuotati, inviatiCoinvolti, bloccati };
}

/**
 * Decide come sincronizzare le voci del rapportino dopo un Salva piano (Opzione A).
 * - `avvisoBloccati`: testo (non bloccante) se ci sono interventi COMPLETATI "spostati".
 * - `richiediConfermaInviati`: true se sono coinvolti rapportini GIÀ INVIATI → chiedere conferma
 *   prima di riaprirli/aggiornarli. Senza inviati coinvolti la riconciliazione delle voci è
 *   AUTOMATICA a ogni Salva (rimuove le voci fantasma, aggiunge le mancanti, preserva le risposte
 *   per `task_id`): è ciò che evita il disallineamento rapportino↔piano.
 */
export function decideSyncRapportini(diff: DiffRapportini): {
  avvisoBloccati: string | null;
  richiediConfermaInviati: boolean;
} {
  const avvisoBloccati = diff.bloccati.length > 0
    ? `Questi interventi sono completati e non andrebbero spostati:\n${diff.bloccati
        .map((b) => `• ${b.descr} (${b.daNome} → ${b.aNome})`)
        .join('\n')}`
    : null;
  return { avvisoBloccati, richiediConfermaInviati: diff.inviatiCoinvolti.length > 0 };
}
