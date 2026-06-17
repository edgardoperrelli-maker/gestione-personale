// lib/interventi/storico/normalizza.test.ts
import { describe, it, expect } from 'vitest';
import { siNo, voceToRigaStorico, ordinaRighe, slicePagina } from './normalizza';
import type { VoceStoricoRow, RigaStorico } from './types';

const staff = new Map<string, string>([['s1', 'Mario Rossi']]);

describe('siNo', () => {
  it('varianti SI', () => {
    expect(siNo('SI')).toBe('SI');
    expect(siNo('true')).toBe('SI');
    expect(siNo('x')).toBe('SI');
    expect(siNo('1')).toBe('SI');
  });
  it('varianti NO', () => {
    expect(siNo('NO')).toBe('NO');
    expect(siNo('false')).toBe('NO');
  });
  it('vuoto/null/undefined → —', () => {
    expect(siNo(null)).toBe('—');
    expect(siNo(undefined)).toBe('—');
    expect(siNo('')).toBe('—');
    expect(siNo('   ')).toBe('—');
  });
  it('valore inatteso → grezzo', () => {
    expect(siNo('FORSE')).toBe('FORSE');
  });
});

describe('voceToRigaStorico', () => {
  it('mappa campi, risposte e esecutore (embed oggetto)', () => {
    const row: VoceStoricoRow = {
      id: 'v1', odl: '200999', via: 'Via Roma 1', comune: 'Roma', matricola: 'M1', nominativo: 'Tizio', pdr: 'P1',
      attivita: 'LIMITAZIONI MASSIVE',
      risposte: { eseguito: 'SI', sostituzione_valvola: 'true', mini_bag: 'true', rg_stop: null, note: 'ok ' },
      manuale: false,
      rapportini: { staff_id: 's1', staff_name: 'DE SANTIS', data: '2026-06-10' },
    };
    const r = voceToRigaStorico(row, staff);
    expect(r.odl).toBe('200999');
    expect(r.data).toBe('2026-06-10');
    expect(r.esecutore).toBe('DE SANTIS');
    expect(r.via).toBe('Via Roma 1');
    expect(r.gruppoAttivita).toBe('LIMITAZIONI MASSIVE');
    expect(r.eseguito).toBe('SI');
    expect(r.sostValvola).toBe('SI');
    expect(r.miniBag).toBe('SI');
    expect(r.rgStop).toBe('—');
    expect(r.note).toBe('ok');
  });
  it('chiave minibag alternativa + embed come array + fallback esecutore da mappa', () => {
    const row = {
      id: 'v2', odl: null, via: null, comune: null, matricola: null, nominativo: null, pdr: null,
      risposte: { minibag: 'true' }, manuale: true,
      rapportini: [{ staff_id: 's1', staff_name: null, data: '2026-06-09' }],
    } as unknown as VoceStoricoRow;
    const r = voceToRigaStorico(row, staff);
    expect(r.miniBag).toBe('SI');
    expect(r.esecutore).toBe('Mario Rossi'); // fallback dalla mappa staff
    expect(r.data).toBe('2026-06-09');
    expect(r.eseguito).toBe('—');
    expect(r.note).toBeNull();
  });
  it('risposte null → tutti i campi SI/NO a —', () => {
    const row = {
      id: 'v3', odl: '1', via: 'X', comune: null, matricola: null, nominativo: null, pdr: null,
      risposte: null, manuale: false, rapportini: { staff_id: null, staff_name: 'OP', data: '2026-06-01' },
    } as unknown as VoceStoricoRow;
    const r = voceToRigaStorico(row, staff);
    expect(r.eseguito).toBe('—');
    expect(r.sostValvola).toBe('—');
    expect(r.esecutore).toBe('OP');
  });
});

describe('ordinaRighe', () => {
  const base = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', odl: null, data: null, esecutore: null, via: null, gruppoAttivita: null,
    eseguito: '—', sostValvola: '—', miniBag: '—', rgStop: '—', note: null, ...p,
  });
  it('ordina per data desc, poi via asc, poi id', () => {
    const out = ordinaRighe([
      base({ id: 'a', data: '2026-06-01', via: 'Roma' }),
      base({ id: 'b', data: '2026-06-10', via: 'Bari' }),
      base({ id: 'c', data: '2026-06-10', via: 'Aosta' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('slicePagina', () => {
  it('estrae la pagina richiesta', () => {
    const righe = Array.from({ length: 5 }, (_, i) => ({ id: String(i) } as unknown as RigaStorico));
    expect(slicePagina(righe, 1, 2).map((r) => r.id)).toEqual(['2', '3']);
  });
});
