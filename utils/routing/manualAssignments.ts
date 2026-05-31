import type { Task } from './types';

export interface ManualRule {
  id: string;
  staffId: string;
  filtroOds: string[];
  filtroIndirizzo: string[];
  filtroCap: string[];
  filtroAttivita: string[];
  maxInterventi: number | null;
  ordine: number;
}

export interface AssignOperator { id: string; qty: number; }

export type ManualWarningType = 'regola_vuota' | 'overflow' | 'ods_doppio' | 'chiuso_vuoto';

export interface ManualWarning { type: ManualWarningType; ruleId?: string; staffId?: string; message: string; }

export interface ManualAssignmentResult {
  assignedByStaff: Record<string, Task[]>;
  remaining: Task[];
  pool: AssignOperator[];
  closedStaffIds: string[];
  warnings: ManualWarning[];
}

export function normValue(v: string | undefined | null): string {
  return (v ?? '').trim().toUpperCase();
}

export function normAddr(v: string | undefined | null): string {
  return normValue(v).replace(/[.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesRule(task: Task, rule: ManualRule): boolean {
  const ods = normValue(task.odsin);
  const cap = normValue(task.cap);
  const att = normValue(task.attivita);
  const addr = normAddr(task.indirizzo);
  const okOds = rule.filtroOds.length === 0 || rule.filtroOds.map(normValue).includes(ods);
  const okAddr = rule.filtroIndirizzo.length === 0
    || rule.filtroIndirizzo.some((a) => normAddr(a).length > 0 && addr.includes(normAddr(a)));
  const okCap = rule.filtroCap.length === 0 || rule.filtroCap.map(normValue).includes(cap);
  const okAtt = rule.filtroAttivita.length === 0 || rule.filtroAttivita.map(normValue).includes(att);
  return okOds && okAddr && okCap && okAtt;
}

export function phaseOfRule(rule: ManualRule): 0 | 1 | 2 {
  if (rule.filtroOds.length > 0 || rule.filtroIndirizzo.length > 0) return 0;
  if (rule.filtroCap.length > 0) return 1;
  return 2;
}

function hasAnyFilter(rule: ManualRule): boolean {
  return rule.filtroOds.length > 0 || rule.filtroIndirizzo.length > 0
    || rule.filtroCap.length > 0 || rule.filtroAttivita.length > 0;
}

export function applyManualAssignments(
  tasks: Task[],
  rules: ManualRule[],
  ops: AssignOperator[],
  locks: Record<string, boolean>,
): ManualAssignmentResult {
  const assignedByStaff: Record<string, Task[]> = {};
  const pinnedCount: Record<string, number> = {};
  const takenBy = new Map<string, string>();
  const warnings: ManualWarning[] = [];

  const valid = rules.filter(hasAnyFilter);

  for (const phase of [0, 1, 2] as const) {
    const inPhase = valid.filter((r) => phaseOfRule(r) === phase).sort((a, b) => a.ordine - b.ordine);
    for (const rule of inPhase) {
      const allMatches = tasks.filter((t) => matchesRule(t, rule));
      const free = allMatches.filter((t) => !takenBy.has(t.id));
      if (phase === 0) {
        const stolen = allMatches.filter((t) => takenBy.has(t.id) && takenBy.get(t.id) !== rule.staffId);
        if (stolen.length > 0) {
          warnings.push({ type: 'ods_doppio', ruleId: rule.id, staffId: rule.staffId, message: `ODS già assegnato ad altro operatore (${stolen.length})` });
        }
      }
      if (free.length === 0) {
        warnings.push({ type: 'regola_vuota', ruleId: rule.id, staffId: rule.staffId, message: 'Nessun intervento corrispondente nel dataset' });
        continue;
      }
      const cap = rule.maxInterventi == null ? Infinity : Math.max(0, rule.maxInterventi);
      const take = free.slice(0, cap);
      if (free.length > cap) {
        warnings.push({ type: 'overflow', ruleId: rule.id, staffId: rule.staffId, message: `${free.length} corrispondenti, assegnati ${take.length}, ${free.length - take.length} redistribuiti` });
      }
      for (const t of take) {
        takenBy.set(t.id, rule.staffId);
        (assignedByStaff[rule.staffId] ??= []).push(t);
        pinnedCount[rule.staffId] = (pinnedCount[rule.staffId] ?? 0) + 1;
      }
    }
  }

  const closedStaffIds = ops.filter((o) => locks[o.id] === false).map((o) => o.id);
  const closedSet = new Set(closedStaffIds);
  for (const id of closedStaffIds) {
    if (!pinnedCount[id]) {
      warnings.push({ type: 'chiuso_vuoto', staffId: id, message: 'Operatore 🔒 chiuso senza interventi corrispondenti: resterà vuoto' });
    }
  }
  const pool = ops.filter((o) => !closedSet.has(o.id)).map((o) => ({ id: o.id, qty: Math.max(0, o.qty - (pinnedCount[o.id] ?? 0)) }));
  const remaining = tasks.filter((t) => !takenBy.has(t.id));
  return { assignedByStaff, remaining, pool, closedStaffIds, warnings };
}
