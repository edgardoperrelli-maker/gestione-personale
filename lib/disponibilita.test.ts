import { describe, it, expect } from 'vitest';
import {
  derivaModalita,
  isAssenzaIntera,
  labelOrario,
  labelDisponibilita,
  indexByStaffData,
  isTipoAssenza,
  isNomeAttivitaAssenza,
  type Disponibilita,
} from './disponibilita';

function d(over: Partial<Disponibilita> = {}): Disponibilita {
  return {
    id: 'id-1', staff_id: 's1', data: '2026-06-12',
    tipo: 'ferie', modalita: 'intera', ora_da: null, ora_a: null, note: null,
    ...over,
  };
}

describe('derivaModalita', () => {
  it('null+null → intera', () => expect(derivaModalita(null, null)).toBe('intera'));
  it('solo ora_a → parziale', () => expect(derivaModalita(null, '13:00')).toBe('parziale'));
  it('solo ora_da → parziale', () => expect(derivaModalita('14:00', null)).toBe('parziale'));
  it('entrambe → parziale', () => expect(derivaModalita('09:00', '13:00')).toBe('parziale'));
});

describe('isAssenzaIntera', () => {
  it('senza orari è intera', () => expect(isAssenzaIntera(d())).toBe(true));
  it('con orario non è intera', () => expect(isAssenzaIntera(d({ ora_a: '13:00' }))).toBe(false));
});

describe('labelOrario', () => {
  it('tutto il giorno', () => expect(labelOrario(null, null)).toBe('tutto il giorno'));
  it('fino alle', () => expect(labelOrario(null, '13:00')).toBe('fino alle 13:00'));
  it('dalle', () => expect(labelOrario('14:00', null)).toBe('dalle 14:00'));
  it('finestra', () => expect(labelOrario('09:00', '13:00')).toBe('09:00–13:00'));
  it('normalizza HH:MM:SS → HH:MM', () => expect(labelOrario(null, '13:00:00')).toBe('fino alle 13:00'));
});

describe('labelDisponibilita', () => {
  it('compone tipo + orario', () =>
    expect(labelDisponibilita(d({ tipo: '104', ora_a: '13:00' }))).toBe('104 · fino alle 13:00'));
});

describe('indexByStaffData', () => {
  it('indicizza per staff_id|data', () => {
    const idx = indexByStaffData([d({ staff_id: 's1', data: '2026-06-12' })]);
    expect(idx['s1|2026-06-12']?.id).toBe('id-1');
  });
});

describe('isTipoAssenza', () => {
  it('accetta i 6 tipi', () => expect(isTipoAssenza('lutto')).toBe(true));
  it('rifiuta altro', () => expect(isTipoAssenza('lavoro')).toBe(false));
});

describe('isNomeAttivitaAssenza', () => {
  it('riconosce i nomi assenza (case/spazi-insensitive)', () => {
    expect(isNomeAttivitaAssenza('Ferie')).toBe(true);
    expect(isNomeAttivitaAssenza('  MALATTIA ')).toBe(true);
    expect(isNomeAttivitaAssenza('104')).toBe(true);
  });
  it('rifiuta attività di lavoro e vuoti', () => {
    expect(isNomeAttivitaAssenza('Clientela')).toBe(false);
    expect(isNomeAttivitaAssenza('')).toBe(false);
    expect(isNomeAttivitaAssenza(null)).toBe(false);
  });
});
