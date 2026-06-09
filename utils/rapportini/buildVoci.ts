export interface TemplateCampo {
  chiave: string; etichetta: string;
  tipo: 'crocetta' | 'testo' | 'select' | 'numero' | 'foto';
  opzioni?: string[];
  obbligatoria?: boolean; // usato dai campi tipo 'foto': slot obbligatorio o facoltativo
  scope_foto?: 'misuratore' | 'fase' | 'accessoria'; // solo per tipo='foto' nei template risanamento
  ordine: number;
}

/** Campi mostrati negli export tabellari (PDF/Excel): esclude i campi 'foto' (allegati, non impaginabili in tabella). */
export function campiEsportabili(campi: TemplateCampo[]): TemplateCampo[] {
  return campi.filter((c) => c.tipo !== 'foto');
}
export interface VoceSnapshot {
  task_id: string; ordine: number;
  nominativo?: string; matricola?: string; pdr?: string; odl?: string;
  via?: string; comune?: string; cap?: string; recapito?: string;
  attivita?: string; accessibilita?: string; fascia_oraria?: string;
  raw_json: unknown;
  annullato?: boolean;
}
export type Voce = VoceSnapshot & { risposte: Record<string, unknown> };

export function taskToVoce(task: any, ordine: number): VoceSnapshot {
  return {
    task_id: String(task.id),
    ordine,
    nominativo: task.nominativo, matricola: task.matricola, pdr: task.pdr, odl: task.odl,
    via: task.indirizzo, comune: task.citta, cap: task.cap, recapito: task.recapito,
    attivita: task.attivita, accessibilita: task.accessibilita, fascia_oraria: task.fascia_oraria,
    raw_json: task,
    annullato: Boolean(task.annullato),
  };
}

export function mergeVoci(fromTasks: VoceSnapshot[], existing: Voce[]): Voce[] {
  const prev = new Map(existing.map((v) => [v.task_id, v.risposte]));
  return fromTasks.map((s) => ({ ...s, risposte: prev.get(s.task_id) ?? {} }));
}
