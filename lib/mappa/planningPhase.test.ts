import { describe, it, expect } from 'vitest';
import { computePlanningPhase, PLANNING_PHASES, type PlanningPhaseInput } from './planningPhase';

const base: PlanningPhaseInput = {
  setupDone: false, isEditMode: false, totalTasks: 0, appointmentCount: 0,
  geocoded: 0, isGeocoding: false, hasDistribution: false, currentPianoId: false,
};

describe('computePlanningPhase', () => {
  it('1 = setup quando il modale non è ancora confermato', () => {
    expect(computePlanningPhase(base)).toBe(1);
  });
  it('salta il setup in edit mode', () => {
    expect(computePlanningPhase({ ...base, isEditMode: true })).toBe(2);
  });
  it('2 = interventi quando non ci sono task né appuntamenti', () => {
    expect(computePlanningPhase({ ...base, setupDone: true })).toBe(2);
  });
  it('3 = geocodifica quando ci sono task non ancora geocodificati', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 3 })).toBe(3);
  });
  it('3 = geocodifica mentre è in corso', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10, isGeocoding: true })).toBe(3);
  });
  it('4 = operatori quando geocodifica completa e nessuna distribuzione', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10 })).toBe(4);
  });
  it('5 = distribuzione creata ma non salvata', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10, hasDistribution: true })).toBe(5);
  });
  it('6 = conferma quando il piano è salvato', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10, hasDistribution: true, currentPianoId: true })).toBe(6);
  });
  it('espone 6 fasi in ordine', () => {
    expect(PLANNING_PHASES.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
