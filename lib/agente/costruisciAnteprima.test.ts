import { describe, it, expect } from 'vitest';
import { costruisciAnteprima, type RigaP } from './costruisciAnteprima';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

const staff = [
  { id: 's1', display_name: 'CIARALLO SIMONE' },
  { id: 's2', display_name: 'PASTORELLI LUIGI' },
];

const riga = (id: string, esecutore: string, odl: string, comune = 'ZAGAROLO'): RigaP => ({
  id, file: 'ZAGAROLO.xlsx', odl, matricola: null, indirizzo: null,
  comune, data: '2026-06-19', esecutore,
});

describe('costruisciAnteprima (per operatore)', () => {
  it('raggruppa per operatore, marca stati e ordina liberi→conflitti→non_risolti', () => {
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

    expect(gruppi.map((g) => g.stato)).toEqual(['libero', 'conflitto', 'non_risolto']);

    expect(gruppi[0].staffId).toBe('s1');
    expect(gruppi[0].nome).toBe('CIARALLO SIMONE');
    expect(gruppi[0].righe.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(gruppi[0].comuni).toHaveLength(1);
    expect(gruppi[0].comuni[0]).toMatchObject({ comune: 'ZAGAROLO', stato: 'libero' });

    expect(gruppi[1].staffId).toBe('s2');
    expect(gruppi[1].stato).toBe('conflitto');
    expect(gruppi[1].submitted).toBe(true);
    expect(gruppi[1].comuni[0].stato).toBe('conflitto');

    expect(gruppi[2].staffId).toBeNull();
    expect(gruppi[2].nome).toBe('ROSSI');
  });

  it('un operatore su più comuni → una sola card con i comuni come sotto-sezioni', () => {
    const righe: RigaP[] = [
      riga('r1', 'CIARALLO', 'O1', 'AFFILE'),
      riga('r2', 'CIARALLO', 'O2', 'GENAZZANO'),
      riga('r3', 'CIARALLO', 'O3', 'GENAZZANO'),
    ];
    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData: {} });
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].nome).toBe('CIARALLO SIMONE');
    expect(gruppi[0].comuni.map((c) => c.comune).sort()).toEqual(['AFFILE', 'GENAZZANO']);
    expect(gruppi[0].righe).toHaveLength(3);
    expect(gruppi[0].stato).toBe('libero');
  });

  it('conflitto in un comune ma libero in un altro → operatore complessivo libero, comuni distinti', () => {
    const righe: RigaP[] = [
      riga('r1', 'CIARALLO', 'O1', 'AFFILE'),    // libero
      riga('r2', 'CIARALLO', 'O2', 'ZAGAROLO'),  // conflitto
    ];
    const esistenti: RapEsistente[] = [
      { id: 'rx', staff_id: 's1', piano_id: 'p9', territorio: 'ZAGAROLO', data: '2026-06-19', stato: 'in_corso', submitted_at: null },
    ];
    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData: { '2026-06-19': esistenti } });
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].stato).toBe('libero'); // almeno un comune libero
    const byComune = Object.fromEntries(gruppi[0].comuni.map((c) => [c.comune, c.stato]));
    expect(byComune).toEqual({ AFFILE: 'libero', ZAGAROLO: 'conflitto' });
  });

  it('senza rapportini esistenti tutti i risolti sono liberi', () => {
    const righe: RigaP[] = [riga('r1', 'CIARALLO', 'O1'), riga('r2', 'PASTORELLI', 'O2')];
    const gruppi = costruisciAnteprima({ righe, staff, esistentiPerData: {} });
    expect(gruppi.every((g) => g.stato === 'libero')).toBe(true);
  });

  it('esecutore con cognome condiviso da due staff → ambiguo (escluso)', () => {
    const staffAmb = [
      { id: 's3', display_name: 'ROSSI MARIO' },
      { id: 's4', display_name: 'ROSSI LUIGI' },
    ];
    const gruppi = costruisciAnteprima({ righe: [riga('r1', 'ROSSI', 'O1')], staff: staffAmb, esistentiPerData: {} });
    expect(gruppi[0].stato).toBe('ambiguo');
    expect(gruppi[0].staffId).toBeNull();
  });
});
