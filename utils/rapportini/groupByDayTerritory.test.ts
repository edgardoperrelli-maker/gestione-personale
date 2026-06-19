import { describe, it, expect } from 'vitest';
import { groupByDayTerritory } from './groupByDayTerritory';
import type { RapRiepilogo } from './groupByDay';

const rap = (o: Partial<RapRiepilogo> & { id: string; piano_id: string; data: string }): RapRiepilogo => ({
  staff_id: 's', staff_name: 'Op', token: 't', stato: 'in_corso',
  expires_at: '', submitted_at: null, url: '', statoCalcolato: 'valido', nVoci: 0,
  territorio: null, piano_creato_at: null, ...o,
});

describe('groupByDayTerritory', () => {
  it('(a) due piani stesso territorio/giorno → un TerritorioGruppo con 2 piani ordinati per creato_at', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'late', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T14:00:00Z' }),
      rap({ id: 'b', piano_id: 'early', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-18');
    expect(out).toHaveLength(1);
    expect(out[0].territori).toHaveLength(1);
    const t = out[0].territori[0];
    expect(t.etichetta).toBe('NORD');
    expect(t.piani).toHaveLength(2);
    expect(t.piani[0].piano_id).toBe('early');
    expect(t.piani[1].piano_id).toBe('late');
    expect(t.nOperatori).toBe(2);
  });

  it('(b) territori diversi nello stesso giorno ordinati alfabeticamente', () => {
    const raps = [
      rap({ id: 'c', piano_id: 'p3', data: '2026-06-18', territorio: 'SUD', piano_creato_at: '2026-06-18T09:00:00Z' }),
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T08:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'EST', piano_creato_at: '2026-06-18T10:00:00Z' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-18');
    expect(out[0].territori.map((t) => t.etichetta)).toEqual(['EST', 'NORD', 'SUD']);
  });

  it('(c) "senza territorio" va in fondo nel giorno', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: null, piano_creato_at: '2026-06-18T08:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-18');
    const etichette = out[0].territori.map((t) => t.etichetta);
    expect(etichette[etichette.length - 1]).toBe('Senza territorio');
    expect(etichette[0]).toBe('NORD');
  });

  it('(d) giorni ordinati in decrescente: i futuri sopra, senza incastrarsi tra oggi e ieri', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-19', territorio: 'NORD', piano_creato_at: '2026-06-19T08:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-17', territorio: 'SUD', piano_creato_at: '2026-06-17T09:00:00Z' }),
      rap({ id: 'c', piano_id: 'p3', data: '2026-06-18', territorio: 'EST', piano_creato_at: '2026-06-18T10:00:00Z' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-18');
    expect(out.map((g) => g.data)).toEqual(['2026-06-19', '2026-06-18', '2026-06-17']);
  });

  it('(d2) una pianificazione per un giorno FUTURO appare sopra oggi e ieri', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-22', territorio: 'NORD', piano_creato_at: '2026-06-19T08:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-19', territorio: 'SUD', piano_creato_at: '2026-06-19T09:00:00Z' }),
      rap({ id: 'c', piano_id: 'p3', data: '2026-06-18', territorio: 'EST', piano_creato_at: '2026-06-18T10:00:00Z' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-19');
    expect(out.map((g) => g.data)).toEqual(['2026-06-22', '2026-06-19', '2026-06-18']);
  });

  it('(e) raggruppamento usa territorio EFFETTIVO (r.territorio), non il piano logico', () => {
    // Due operatori nello stesso giorno e piano logico ma con territorio effettivo diverso:
    // il secondo ha territorio_override applicato lato server → r.territorio='SUD'
    const raps = [
      rap({ id: 'op1', piano_id: 'p1', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T08:00:00Z', staff_id: 's1' }),
      rap({ id: 'op2', piano_id: 'p1', data: '2026-06-18', territorio: 'SUD',  piano_creato_at: '2026-06-18T08:00:00Z', staff_id: 's2', territorio_override: 'SUD' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-18');
    const territori = out[0].territori;
    // Devono esserci due TerritorioGruppo distinti
    expect(territori).toHaveLength(2);
    const etichette = territori.map((t) => t.etichetta).sort();
    expect(etichette).toEqual(['NORD', 'SUD']);
    // L'operatore spostato deve conservare territorio_override nel risultato (usato dal badge "↪ spostato")
    const gruppoSud = territori.find((t) => t.etichetta === 'SUD')!;
    const opSpostato = gruppoSud.piani[0].operatori[0];
    expect(opSpostato.territorio_override).toBe('SUD');
  });

  it('nOperatori conta tutti gli operatori del territorio (su tutti i piani)', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T08:00:00Z', staff_id: 's1' }),
      rap({ id: 'b', piano_id: 'p1', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T08:00:00Z', staff_id: 's2' }),
      rap({ id: 'c', piano_id: 'p2', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T10:00:00Z', staff_id: 's3' }),
    ];
    const out = groupByDayTerritory(raps, '2026-06-18');
    expect(out[0].territori[0].nOperatori).toBe(3);
  });
});
