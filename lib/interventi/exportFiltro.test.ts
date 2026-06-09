import { describe, it, expect } from 'vitest';
import { interventoMatchStato } from './exportFiltro';

describe('interventoMatchStato', () => {
  it('tutti → sempre true', () => {
    expect(interventoMatchStato({ stato: 'assegnato', esito: null }, 'tutti')).toBe(true);
    expect(interventoMatchStato({ stato: 'completato', esito: 'accesso_negato' }, 'tutti')).toBe(true);
  });
  it('ok → solo completato positivo', () => {
    expect(interventoMatchStato({ stato: 'completato', esito: 'eseguito_positivo' }, 'ok')).toBe(true);
    expect(interventoMatchStato({ stato: 'completato', esito: 'accesso_negato' }, 'ok')).toBe(false);
  });
  it('ko → completato non positivo', () => {
    expect(interventoMatchStato({ stato: 'completato', esito: 'accesso_negato' }, 'ko')).toBe(true);
    expect(interventoMatchStato({ stato: 'completato', esito: 'eseguito_positivo' }, 'ko')).toBe(false);
  });
  it('attesa → solo assegnato', () => {
    expect(interventoMatchStato({ stato: 'assegnato', esito: null }, 'attesa')).toBe(true);
    expect(interventoMatchStato({ stato: 'in_esecuzione', esito: null }, 'attesa')).toBe(false);
  });
});
