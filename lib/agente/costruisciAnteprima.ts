// lib/agente/costruisciAnteprima.ts
// PURO: trasforma le righe pianificabili nella struttura dell'anteprima (Comune → Operatore →
// righe), con lo STATO di ciascun operatore (libero/conflitto/non_risolto/ambiguo). Riusa
// risolviEsecutore e partizionaConflitti — nessuna logica duplicata. Gli `esistenti` (rapportini)
// sono passati già caricati, così la funzione resta pura e testabile.
import { risolviEsecutore } from '@/lib/agente/risolviEsecutore';
import { partizionaConflitti } from '@/lib/agente/partizionaConflitti';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export type RigaP = {
  id: string; file: string; odl: string | null; matricola: string | null;
  indirizzo: string | null; comune: string | null; data: string; esecutore: string | null;
};
export type StatoOp = 'libero' | 'conflitto' | 'non_risolto' | 'ambiguo';
export type OperatoreAnteprima = {
  key: string; staffId: string | null; nome: string; stato: StatoOp; submitted: boolean; righe: RigaP[];
};
export type GruppoAnteprima = { comune: string; data: string; operatori: OperatoreAnteprima[] };

const ORD: Record<StatoOp, number> = { libero: 0, conflitto: 1, ambiguo: 2, non_risolto: 3 };

export function costruisciAnteprima(args: {
  righe: RigaP[];
  staff: { id: string; display_name: string }[];
  esistentiPerData: Record<string, RapEsistente[]>;
}): GruppoAnteprima[] {
  const { righe, staff, esistentiPerData } = args;

  // 1) raggruppa per (data, comune) → operatore
  const gruppi = new Map<string, { comune: string; data: string; ops: Map<string, OperatoreAnteprima> }>();
  for (const r of righe ?? []) {
    const comune = r.comune ?? '';
    const gKey = `${r.data}|${comune}`;
    let g = gruppi.get(gKey);
    if (!g) { g = { comune, data: r.data, ops: new Map() }; gruppi.set(gKey, g); }

    const ris = risolviEsecutore(r.esecutore ?? '', staff);
    let opKey: string, staffId: string | null, nome: string, stato: StatoOp;
    if ('errore' in ris) {
      staffId = null;
      stato = ris.errore === 'ambiguo' ? 'ambiguo' : 'non_risolto';
      nome = (r.esecutore ?? '').trim() || '—';
      opKey = `${stato}|${nome.toUpperCase()}`;
    } else {
      staffId = ris.staffId; nome = ris.staffName; stato = 'libero'; opKey = `staff|${ris.staffId}`;
    }
    let op = g.ops.get(opKey);
    if (!op) { op = { key: opKey, staffId, nome, stato, submitted: false, righe: [] }; g.ops.set(opKey, op); }
    op.righe.push(r);
  }

  // 2) per ogni gruppo (data, comune) marca i conflitti sugli operatori risolti
  const out: GruppoAnteprima[] = [];
  for (const g of gruppi.values()) {
    const risolti = [...g.ops.values()].filter((o) => o.staffId != null);
    const esistenti = esistentiPerData[g.data] ?? [];
    const { inConflitto } = partizionaConflitti({
      operatori: risolti.map((o) => ({ staff_id: o.staffId as string, staff_name: o.nome })),
      data: g.data, comune: g.comune, esistenti,
    });
    const confById = new Map(inConflitto.map((c) => [c.staff_id, c]));
    for (const o of g.ops.values()) {
      if (o.staffId != null && confById.has(o.staffId)) {
        o.stato = 'conflitto';
        o.submitted = confById.get(o.staffId)!.submitted;
      }
    }
    const operatori = [...g.ops.values()].sort(
      (a, b) => ORD[a.stato] - ORD[b.stato] || a.nome.localeCompare(b.nome),
    );
    out.push({ comune: g.comune, data: g.data, operatori });
  }

  out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.comune.localeCompare(b.comune)));
  return out;
}
