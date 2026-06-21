// lib/agente/raggruppaCommessaAttivita.ts
// PURO: raggruppa le righe pianificabili per commessa (committente) e attività, usando agente_file_config.
export type NodoAttivita = { attivita: string; ids: string[] };
export type NodoCommessa = { committente: string; attivita: NodoAttivita[]; ids: string[] };

type Riga = { id: string; file: string };
type Cfg = { file: string; committente: string; attivita: string };

export function raggruppaCommessaAttivita(righe: Riga[], fileConfig: Cfg[]): NodoCommessa[] {
  const byFile = new Map(fileConfig.map((c) => [c.file, c]));
  // committente -> attività -> ids
  const mappa = new Map<string, Map<string, string[]>>();
  for (const r of righe ?? []) {
    const cfg = byFile.get(r.file);
    const committente = cfg?.committente ?? 'altro';
    const attivita = cfg?.attivita ?? '(non configurato)';
    if (!mappa.has(committente)) mappa.set(committente, new Map());
    const att = mappa.get(committente)!;
    if (!att.has(attivita)) att.set(attivita, []);
    att.get(attivita)!.push(r.id);
  }
  const out: NodoCommessa[] = [];
  for (const committente of [...mappa.keys()].sort()) {
    const att = mappa.get(committente)!;
    const attivita: NodoAttivita[] = [...att.keys()].sort().map((a) => ({ attivita: a, ids: att.get(a)! }));
    out.push({ committente, attivita, ids: attivita.flatMap((a) => a.ids) });
  }
  return out;
}
