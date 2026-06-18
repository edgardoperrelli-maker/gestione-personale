import { describe, it, expect } from 'vitest';
import { costruisciAnteprima, type RigaP } from './costruisciAnteprima';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

const staff = [
  { id: 's1', display_name: 'CIARALLO SIMONE' },
  { id: 's2', display_name: 'PASTORELLI LUIGI' },
];

const riga = (id: string, esecutore: string, odl: string): RigaP => ({
  id, file: 'ZAGAROLO.xlsx', odl, matricola: null, indirizzo: null,
  comune: 'ZAGAROLO', data: '2026-06-19', esecutore,
});

describe('costruisciAnteprima', () => {
  it('raggruppa per comune→operatore, marca stati e ordina liberi→conflitti→non_risolti', () => {
    const righe: RigaP[] = [
      riga('r1', 'CIARALLO', 'O1'),
      riga('r2', 'CIARALLO', 'O2'),
      riga('r3', 'PASTORELLI', 'O3'),
      riga('r4', 'ROSSI', 'O4'), // non in staff → non_risolto
    ];
    // PASTORELLI (s2) ha già un rapportino a ZAGAROLO il 19/06 → conflitto (submitted)
    const esistenti: RapEsistente[] = [
      { id: 'rx', staff_id: 's2', piano_id: 'p9', territorio: 'ZAGAROLO', data: '2026-06-19', stato: 'inviato', submitted_at: '2026-06-19T10:00:00Z' },
    ];

    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData: { '2026-06-19': esistenti } });

    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].comune).toBe('ZAGAROLO');
    expect(gruppi[0].data).toBe('2026-06-19');

    const ops = gruppi[0].operatori;
    expect(ops.map((o) => o.stato)).toEqual(['libero', 'conflitto', 'non_risolto']);

    expect(ops[0].staffId).toBe('s1');
    expect(ops[0].nome).toBe('CIARALLO SIMONE');
    expect(ops[0].righe.map((r) => r.id)).toEqual(['r1', 'r2']);

    expect(ops[1].staffId).toBe('s2');
    expect(ops[1].stato).toBe('conflitto');
    expect(ops[1].submitted).toBe(true);
    expect(ops[1].righe.map((r) => r.id)).toEqual(['r3']);

    expect(ops[2].staffId).toBeNull();
    expect(ops[2].nome).toBe('ROSSI');
    expect(ops[2].righe.map((r) => r.id)).toEqual(['r4']);
  });

  it('senza rapportini esistenti tutti i risolti sono liberi', () => {
    const righe: RigaP[] = [riga('r1', 'CIARALLO', 'O1'), riga('r2', 'PASTORELLI', 'O2')];
    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData: {} });
    expect(gruppi[0].operatori.every((o) => o.stato === 'libero')).toBe(true);
  });

  it('conflitto solo se stesso comune (territorio diverso = libero)', () => {
    const righe: RigaP[] = [riga('r1', 'CIARALLO', 'O1')];
    const esistenti: RapEsistente[] = [
      { id: 'rx', staff_id: 's1', piano_id: 'p9', territorio: 'TIVOLI', data: '2026-06-19', stato: 'in_corso', submitted_at: null },
    ];
    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData: { '2026-06-19': esistenti } });
    expect(gruppi[0].operatori[0].stato).toBe('libero');
  });

  it('esecutore con cognome condiviso da due staff → ambiguo (escluso)', () => {
    const staffAmb = [
      { id: 's3', display_name: 'ROSSI MARIO' },
      { id: 's4', display_name: 'ROSSI LUIGI' },
    ];
    const gruppi = costruisciAnteprima({ righe: [riga('r1', 'ROSSI', 'O1')], staff: staffAmb, esistentiPerData: {} });
    expect(gruppi[0].operatori[0].stato).toBe('ambiguo');
    expect(gruppi[0].operatori[0].staffId).toBeNull();
  });
});
