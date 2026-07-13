import { describe, it, expect } from 'vitest';
import type { Assignment } from '@/types';
import {
  crewSizeAttivita,
  raggruppaSquadre,
  membriPresenti,
  pianoAggancio,
  pianoRimuoviMembro,
  pianoSciogli,
  pianoSetCapo,
} from './squadre';

function a(p: Partial<Assignment> & { id: string }): Assignment {
  return {
    day_id: 'd1',
    reperibile: false,
    staff: { id: `s-${p.id}`, display_name: p.id.toUpperCase() },
    territory: { id: 't1', name: 'NAPOLI' },
    activity: { id: 'act', name: 'RESINE' },
    ...p,
  } as Assignment;
}

describe('crewSizeAttivita', () => {
  it('RESINE → 4 (case/trim insensitive), altre → null', () => {
    expect(crewSizeAttivita('RESINE')).toBe(4);
    expect(crewSizeAttivita(' resine ')).toBe(4);
    expect(crewSizeAttivita('Sopralluogo')).toBeNull();
    expect(crewSizeAttivita(null)).toBeNull();
  });
});

describe('raggruppaSquadre', () => {
  it('separa singole e squadre, preserva la posizione del primo membro', () => {
    const list = [
      a({ id: 'x', squadra_id: null, activity: { id: 'a', name: 'Sopralluogo' } }),
      a({ id: 'm1', squadra_id: 'SQ', team_order: 1 }),
      a({ id: 'm0', squadra_id: 'SQ', team_order: 0, is_capo: true }),
      a({ id: 'y', squadra_id: null, activity: { id: 'a', name: 'Sopralluogo' } }),
    ];
    const out = raggruppaSquadre(list);
    expect(out.map((i) => i.kind)).toEqual(['single', 'squad', 'single']);
    const squad = out[1];
    if (squad.kind !== 'squad') throw new Error('atteso squad');
    expect(squad.membri.map((m) => m.id)).toEqual(['m0', 'm1']); // ordinati per team_order
    expect(squad.capo?.id).toBe('m0');
    expect(squad.target).toBe(4); // RESINE
  });

  it('capo = primo membro se nessuno ha is_capo', () => {
    const out = raggruppaSquadre([
      a({ id: 'b', squadra_id: 'S', team_order: 2 }),
      a({ id: 'a', squadra_id: 'S', team_order: 1 }),
    ]);
    const g = out[0];
    if (g.kind !== 'squad') throw new Error('atteso squad');
    expect(g.capo?.id).toBe('a');
  });

  it('squadra con un solo membro è resa come singola (degenere)', () => {
    const out = raggruppaSquadre([a({ id: 'solo', squadra_id: 'S', team_order: 0 })]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('single');
  });
});

describe('membriPresenti', () => {
  it('conta i presenti escludendo gli assenti interi', () => {
    const membri = [a({ id: 'p1' }), a({ id: 'p2' }), a({ id: 'p3' })];
    const assenti = new Set(['s-p2']);
    expect(membriPresenti(membri, assenti)).toEqual({ presenti: 2, totale: 3 });
  });
});

describe('pianoAggancio', () => {
  it('card singola + card singola → nuova squadra, target=capo, dragged in coda', () => {
    const target = a({ id: 't' });
    const dragged = a({ id: 'g' });
    const patches = pianoAggancio({ squadraIdNuovo: 'NEW', target, dragged, membriTarget: [] });
    expect(patches).toEqual([
      { id: 't', squadra_id: 'NEW', team_order: 0, is_capo: true },
      { id: 'g', squadra_id: 'NEW', team_order: 1, is_capo: false },
    ]);
  });

  it('target già in squadra → dragged si aggiunge in coda (order max+1), niente capo', () => {
    const target = a({ id: 't', squadra_id: 'SQ', team_order: 0, is_capo: true });
    const m1 = a({ id: 'm1', squadra_id: 'SQ', team_order: 1 });
    const dragged = a({ id: 'g' });
    const patches = pianoAggancio({ squadraIdNuovo: 'NEW', target, dragged, membriTarget: [target, m1] });
    expect(patches).toEqual([{ id: 'g', squadra_id: 'SQ', team_order: 2, is_capo: false }]);
  });

  it('no-op se stessa card o già nella stessa squadra', () => {
    const t = a({ id: 't', squadra_id: 'SQ' });
    expect(pianoAggancio({ squadraIdNuovo: 'N', target: t, dragged: t, membriTarget: [] })).toEqual([]);
    const g = a({ id: 'g', squadra_id: 'SQ' });
    expect(pianoAggancio({ squadraIdNuovo: 'N', target: t, dragged: g, membriTarget: [t, g] })).toEqual([]);
  });
});

describe('pianoRimuoviMembro', () => {
  it('da 3 membri: rimuove uno, gli altri restano', () => {
    const membri = [
      a({ id: 'm0', squadra_id: 'S', team_order: 0, is_capo: true }),
      a({ id: 'm1', squadra_id: 'S', team_order: 1 }),
      a({ id: 'm2', squadra_id: 'S', team_order: 2 }),
    ];
    const p = pianoRimuoviMembro(membri, 'm2');
    expect(p).toEqual([{ id: 'm2', squadra_id: null, team_order: null, is_capo: false }]);
  });

  it('rimuovendo il capo, promuove il primo rimasto', () => {
    const membri = [
      a({ id: 'm0', squadra_id: 'S', team_order: 0, is_capo: true }),
      a({ id: 'm1', squadra_id: 'S', team_order: 1 }),
      a({ id: 'm2', squadra_id: 'S', team_order: 2 }),
    ];
    const p = pianoRimuoviMembro(membri, 'm0');
    expect(p).toContainEqual({ id: 'm0', squadra_id: null, team_order: null, is_capo: false });
    expect(p).toContainEqual({ id: 'm1', squadra_id: 'S', team_order: 1, is_capo: true });
  });

  it('scendendo sotto 2 membri la squadra si scioglie (azzera tutti)', () => {
    const membri = [
      a({ id: 'm0', squadra_id: 'S', team_order: 0, is_capo: true }),
      a({ id: 'm1', squadra_id: 'S', team_order: 1 }),
    ];
    const p = pianoRimuoviMembro(membri, 'm1');
    expect(p).toEqual([
      { id: 'm0', squadra_id: null, team_order: null, is_capo: false },
      { id: 'm1', squadra_id: null, team_order: null, is_capo: false },
    ]);
  });
});

describe('pianoSciogli', () => {
  it('azzera squadra_id/team_order/is_capo su tutti', () => {
    const membri = [
      a({ id: 'm0', squadra_id: 'S', team_order: 0, is_capo: true }),
      a({ id: 'm1', squadra_id: 'S', team_order: 1 }),
    ];
    expect(pianoSciogli(membri)).toEqual([
      { id: 'm0', squadra_id: null, team_order: null, is_capo: false },
      { id: 'm1', squadra_id: null, team_order: null, is_capo: false },
    ]);
  });
});

describe('pianoSetCapo', () => {
  it('sposta il capo: solo le righe che cambiano', () => {
    const membri = [
      a({ id: 'm0', squadra_id: 'S', team_order: 0, is_capo: true }),
      a({ id: 'm1', squadra_id: 'S', team_order: 1, is_capo: false }),
      a({ id: 'm2', squadra_id: 'S', team_order: 2, is_capo: false }),
    ];
    const p = pianoSetCapo(membri, 'm1');
    expect(p).toContainEqual({ id: 'm0', squadra_id: 'S', team_order: 0, is_capo: false });
    expect(p).toContainEqual({ id: 'm1', squadra_id: 'S', team_order: 1, is_capo: true });
    expect(p.find((x) => x.id === 'm2')).toBeUndefined(); // invariato
  });
});
