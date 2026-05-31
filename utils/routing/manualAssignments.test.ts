import { describe, it, expect } from 'vitest';
import {
  normValue, normAddr, matchesRule, phaseOfRule, applyManualAssignments,
  type ManualRule,
} from './manualAssignments';
import type { Task } from './types';

const task = (over: Partial<Task>): Task => ({
  id: 't', odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over,
});
const rule = (over: Partial<ManualRule>): ManualRule => ({
  id: 'r', staffId: 's', filtroOds: [], filtroIndirizzo: [], filtroCap: [], filtroAttivita: [],
  maxInterventi: null, ordine: 0, ...over,
});
const ops = [{ id: 'mario', qty: 30 }, { id: 'anna', qty: 30 }, { id: 'sara', qty: 30 }];

describe('normValue', () => {
  it('trim + uppercase', () => { expect(normValue('  s-ai-051 ')).toBe('S-AI-051'); });
  it('gestisce null/undefined', () => { expect(normValue(undefined)).toBe(''); expect(normValue(null)).toBe(''); });
});

describe('normAddr', () => {
  it('rimuove punteggiatura e spazi multipli, uppercase', () => { expect(normAddr('Via Roma, 12  ')).toBe('VIA ROMA 12'); });
  it('case/spazi diversi → stessa forma', () => { expect(normAddr('via  roma 12')).toBe(normAddr('VIA ROMA, 12')); });
});

describe('matchesRule', () => {
  it('CAP esatto', () => {
    expect(matchesRule(task({ cap: '00044' }), rule({ filtroCap: ['00044'] }))).toBe(true);
    expect(matchesRule(task({ cap: '00045' }), rule({ filtroCap: ['00044'] }))).toBe(false);
  });
  it('ODS su odsin', () => { expect(matchesRule(task({ odsin: 'ods-1' }), rule({ filtroOds: ['ODS-1'] }))).toBe(true); });
  it('indirizzo: match "contiene" normalizzato', () => {
    expect(matchesRule(task({ indirizzo: 'Via Roma 12, Frascati' }), rule({ filtroIndirizzo: ['via roma 12'] }))).toBe(true);
  });
  it('combinati in AND', () => {
    const r = rule({ filtroCap: ['00044'], filtroAttivita: ['S-AI-051'] });
    expect(matchesRule(task({ cap: '00044', attivita: 'S-AI-051' }), r)).toBe(true);
    expect(matchesRule(task({ cap: '00044', attivita: 'X' }), r)).toBe(false);
  });
  it('filtri vuoti ignorati', () => {
    expect(matchesRule(task({ cap: '00044' }), rule({ filtroCap: ['00044'], filtroOds: [] }))).toBe(true);
  });
});

describe('phaseOfRule', () => {
  it('ODS o indirizzo → fase 0', () => {
    expect(phaseOfRule(rule({ filtroOds: ['X'] }))).toBe(0);
    expect(phaseOfRule(rule({ filtroIndirizzo: ['Y'] }))).toBe(0);
    expect(phaseOfRule(rule({ filtroOds: ['X'], filtroCap: ['00044'] }))).toBe(0);
  });
  it('CAP (senza ODS/indirizzo) → fase 1', () => { expect(phaseOfRule(rule({ filtroCap: ['00044'], filtroAttivita: ['A'] }))).toBe(1); });
  it('solo attività → fase 2', () => { expect(phaseOfRule(rule({ filtroAttivita: ['A'] }))).toBe(2); });
});

describe('applyManualAssignments', () => {
  it('cascata: ODS vince su CAP per lo stesso intervento', () => {
    const tasks = [task({ id: 'a', odsin: 'O1', cap: '00044' })];
    const rules = [
      rule({ id: 'rOds', staffId: 'mario', filtroOds: ['O1'], ordine: 0 }),
      rule({ id: 'rCap', staffId: 'anna', filtroCap: ['00044'], ordine: 0 }),
    ];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']?.map((t) => t.id)).toEqual(['a']);
    expect(res.assignedByStaff['anna'] ?? []).toEqual([]);
    expect(res.remaining).toEqual([]);
  });
  it('tetto X: assegna fino a X, eccesso in remaining + warning overflow', () => {
    const tasks = [task({ id: 'a', cap: '1' }), task({ id: 'b', cap: '1' }), task({ id: 'c', cap: '1' })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroCap: ['1'], maxInterventi: 2 })];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']).toHaveLength(2);
    expect(res.remaining).toHaveLength(1);
    expect(res.warnings.some((w) => w.type === 'overflow')).toBe(true);
  });
  it('lucchetto chiuso: operatore fuori dal pool', () => {
    const tasks = [task({ id: 'a', cap: '1' })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroCap: ['1'] })];
    const res = applyManualAssignments(tasks, rules, ops, { mario: false });
    expect(res.closedStaffIds).toContain('mario');
    expect(res.pool.find((o) => o.id === 'mario')).toBeUndefined();
  });
  it('lucchetto aperto (default): capacità ridotta dai pinnati', () => {
    const tasks = [task({ id: 'a', cap: '1' }), task({ id: 'b', cap: '1' })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroCap: ['1'], maxInterventi: 2 })];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.pool.find((o) => o.id === 'mario')?.qty).toBe(28);
  });
  it('regola a vuoto → warning regola_vuota', () => {
    const res = applyManualAssignments([task({ id: 'a', cap: '1' })], [rule({ id: 'r', staffId: 'mario', filtroCap: ['999'] })], ops, {});
    expect(res.warnings.some((w) => w.type === 'regola_vuota')).toBe(true);
  });
  it('ODS doppio → primo per ordine vince, warning ods_doppio', () => {
    const tasks = [task({ id: 'a', odsin: 'O1' })];
    const rules = [
      rule({ id: 'r1', staffId: 'mario', filtroOds: ['O1'], ordine: 0 }),
      rule({ id: 'r2', staffId: 'anna', filtroOds: ['O1'], ordine: 1 }),
    ];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']).toHaveLength(1);
    expect(res.warnings.some((w) => w.type === 'ods_doppio')).toBe(true);
  });
  it('chiuso senza match → warning chiuso_vuoto', () => {
    const res = applyManualAssignments([task({ id: 'a', cap: '1' })], [rule({ id: 'r', staffId: 'mario', filtroCap: ['999'] })], ops, { mario: false });
    expect(res.warnings.some((w) => w.type === 'chiuso_vuoto' && w.staffId === 'mario')).toBe(true);
  });
  it('fallback indirizzo quando ODS assente nel dato', () => {
    const tasks = [task({ id: 'a', indirizzo: 'Via Roma 12, Frascati', odsin: undefined })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroIndirizzo: ['via roma 12'] })];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']?.map((t) => t.id)).toEqual(['a']);
  });
});
