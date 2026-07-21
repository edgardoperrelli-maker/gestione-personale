import { describe, it, expect } from 'vitest';
import { risolviTemplateCommittente, type TemplateRow } from './risolviTemplateCommittente';

const tpl = (id: string, committente: string | null, active = true): TemplateRow =>
  ({ id, committente, active });

describe('risolviTemplateCommittente (solo match esatto: is_default ritirato)', () => {
  it('match esatto sul committente attivo', () => {
    const list = [tpl('a', 'acea'), tpl('b', 'italgas'), tpl('x', null)];
    expect(risolviTemplateCommittente('italgas', list)).toBe('b');
  });
  it('nessun match committente → null (il chiamante eredita i campi standard)', () => {
    const list = [tpl('a', 'acea'), tpl('x', null)];
    expect(risolviTemplateCommittente('altro', list)).toBeNull();
  });
  it('ignora i template non attivi: senza alternativa attiva → null', () => {
    const list = [tpl('a', 'acea', false), tpl('x', null)];
    expect(risolviTemplateCommittente('acea', list)).toBeNull();
  });
  it('nessun candidato → null', () => {
    expect(risolviTemplateCommittente('acea', [])).toBeNull();
  });
  it('il campo is_default eventualmente presente nei dati non ha alcun effetto', () => {
    const listaConResiduo = [
      { ...tpl('x', null), is_default: true } as TemplateRow & { is_default: boolean },
      tpl('a', 'acea'),
    ];
    expect(risolviTemplateCommittente('acea', listaConResiduo)).toBe('a');
    expect(risolviTemplateCommittente('altro', listaConResiduo)).toBeNull();
  });
});
