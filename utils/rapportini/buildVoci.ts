export interface TemplateCampo {
  chiave: string; etichetta: string;
  tipo: 'crocetta' | 'testo' | 'select' | 'numero';
  opzioni?: string[]; ordine: number;
}
export interface VoceSnapshot {
  task_id: string; ordine: number;
  nominativo?: string; matricola?: string; pdr?: string; odsin?: string;
  via?: string; comune?: string; cap?: string; recapito?: string;
  attivita?: string; accessibilita?: string; fascia_oraria?: string;
  raw_json: unknown;
}
export type Voce = VoceSnapshot & { risposte: Record<string, unknown> };

export function taskToVoce(task: any, ordine: number): VoceSnapshot {
  return {
    task_id: String(task.id),
    ordine,
    nominativo: task.nominativo, matricola: task.matricola, pdr: task.pdr, odsin: task.odsin,
    via: task.indirizzo, comune: task.citta, cap: task.cap, recapito: task.recapito,
    attivita: task.attivita, accessibilita: task.accessibilita, fascia_oraria: task.fascia_oraria,
    raw_json: task,
  };
}

export function mergeVoci(fromTasks: VoceSnapshot[], existing: Voce[]): Voce[] {
  const prev = new Map(existing.map((v) => [v.task_id, v.risposte]));
  return fromTasks.map((s) => ({ ...s, risposte: prev.get(s.task_id) ?? {} }));
}
