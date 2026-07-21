export interface TemplateCampo {
  chiave: string; etichetta: string;
  tipo: 'crocetta' | 'testo' | 'select' | 'numero' | 'foto' | 'ora';
  opzioni?: string[];
  obbligatoria?: boolean; // campo obbligatorio: foto = slot richiesto; non-foto = blocco rigido all'invio (tutti i template)
  scope_foto?: 'misuratore' | 'fase' | 'accessoria'; // solo per tipo='foto' nei template risanamento
  /** Obbligo su condizione (solo tipo='foto'), configurato da Azioni operatori: la foto è
   *  richiesta quando l'azione `chiave` della stessa voce ha la risposta `valore`
   *  (trigger crocetta: 'SI' = spuntata; trigger select: una delle sue opzioni).
   *  Vive nel jsonb `campi` — nessuna migration; assente/null = comportamento invariato. */
  obbligatoria_se?: { chiave: string; valore: string } | null;
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
