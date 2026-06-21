// lib/agente/costruisciAnteprima.ts
// PURO: trasforma le righe pianificabili nella struttura dell'anteprima raggruppata per
// OPERATORE (data → operatore → comuni), con lo STATO per-comune (libero/conflitto) perché il
// conflitto è per (operatore, comune). Riusa risolviEsecutore e partizionaConflitti.
import { risolviEsecutore } from '@/lib/agente/risolviEsecutore';
import { partizionaConflitti } from '@/lib/agente/partizionaConflitti';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export type RigaP = {
  id: string; file: string; odl: string | null; matricola: string | null;
  indirizzo: string | null; comune: string | null; data: string; esecutore: string | null;
};
export type StatoOp = 'libero' | 'conflitto' | 'non_risolto' | 'ambiguo';
export type ComuneOp = { comune: string; stato: StatoOp; submitted: boolean; righe: RigaP[] };
export type GruppoOperatore = {
  key: string; staffId: string | null; nome: string; data: string;
  stato: StatoOp;      // complessivo: errore se non risolto; 'libero' se almeno un comune libero, altrimenti 'conflitto'
  submitted: boolean;  // true se qualche comune in conflitto è già inviato
  comuni: ComuneOp[];
  righe: RigaP[];      // tutte le righe dell'operatore (selezionabili = quelle dei comuni 'libero')
};

const ORD: Record<StatoOp, number> = { libero: 0, conflitto: 1, ambiguo: 2, non_risolto: 3 };

export function costruisciAnteprima(args: {
  righe: RigaP[];
  staff: { id: string; display_name: string }[];
  esistentiPerData: Record<string, RapEsistente[]>;
}): GruppoOperatore[] {
  const { righe, staff, esistentiPerData } = args;

  // 1) raggruppa per (data, operatore) → comune → righe
  type Op = {
    key: string; staffId: string | null; nome: string; data: string;
    statoErrore: StatoOp | null; comuni: Map<string, RigaP[]>;
  };
  const operatori = new Map<string, Op>();
  for (const r of righe ?? []) {
    const comune = r.comune ?? '';
    const ris = risolviEsecutore(r.esecutore ?? '', staff);
    let key: string, staffId: string | null, nome: string, statoErrore: StatoOp | null;
    if ('errore' in ris) {
      staffId = null;
      statoErrore = ris.errore === 'ambiguo' ? 'ambiguo' : 'non_risolto';
      nome = (r.esecutore ?? '').trim() || '—';
      key = `${statoErrore}|${nome.toUpperCase()}|${r.data}`;
    } else {
      staffId = ris.staffId; nome = ris.staffName; statoErrore = null;
      key = `staff|${ris.staffId}|${r.data}`;
    }
    let op = operatori.get(key);
    if (!op) { op = { key, staffId, nome, data: r.data, statoErrore, comuni: new Map() }; operatori.set(key, op); }
    if (!op.comuni.has(comune)) op.comuni.set(comune, []);
    op.comuni.get(comune)!.push(r);
  }

  // 2) conflitti per (data, comune): raccogli gli operatori risolti presenti in ciascun comune
  const perComune = new Map<string, { data: string; comune: string; ops: { staff_id: string; staff_name: string }[] }>();
  for (const op of operatori.values()) {
    if (op.staffId == null) continue;
    for (const comune of op.comuni.keys()) {
      const k = `${op.data}|${comune}`;
      let pc = perComune.get(k);
      if (!pc) { pc = { data: op.data, comune, ops: [] }; perComune.set(k, pc); }
      pc.ops.push({ staff_id: op.staffId, staff_name: op.nome });
    }
  }
  const conflitti = new Map<string, Map<string, boolean>>(); // `${data}|${comune}` → staffId → submitted
  for (const pc of perComune.values()) {
    const { inConflitto } = partizionaConflitti({
      operatori: pc.ops, data: pc.data, comune: pc.comune, esistenti: esistentiPerData[pc.data] ?? [],
    });
    conflitti.set(`${pc.data}|${pc.comune}`, new Map(inConflitto.map((c) => [c.staff_id, c.submitted])));
  }

  // 3) costruisci l'output per operatore
  const out: GruppoOperatore[] = [];
  for (const op of operatori.values()) {
    const comuni: ComuneOp[] = [];
    const righeAll: RigaP[] = [];
    let anyLibero = false, anySubmitted = false;
    for (const [comune, rs] of op.comuni.entries()) {
      let stato: StatoOp; let submitted = false;
      if (op.staffId == null) {
        stato = op.statoErrore as StatoOp;
      } else {
        const conf = conflitti.get(`${op.data}|${comune}`);
        if (conf && conf.has(op.staffId)) { stato = 'conflitto'; submitted = conf.get(op.staffId)!; anySubmitted = anySubmitted || submitted; }
        else { stato = 'libero'; anyLibero = true; }
      }
      comuni.push({ comune, stato, submitted, righe: rs });
      righeAll.push(...rs);
    }
    comuni.sort((a, b) => ORD[a.stato] - ORD[b.stato] || a.comune.localeCompare(b.comune));
    const stato: StatoOp = op.staffId == null ? (op.statoErrore as StatoOp) : (anyLibero ? 'libero' : 'conflitto');
    out.push({ key: op.key, staffId: op.staffId, nome: op.nome, data: op.data, stato, submitted: anySubmitted, comuni, righe: righeAll });
  }

  out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) || ORD[a.stato] - ORD[b.stato] || a.nome.localeCompare(b.nome));
  return out;
}
