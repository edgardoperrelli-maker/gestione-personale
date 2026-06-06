import { describe, it, expect } from 'vitest';
import { risolviTemplateCommittente, type TemplateRow } from './risolviTemplateCommittente';

const tpl = (id: string, committente: string | null, is_default = false, active = true): TemplateRow =>
  ({ id, committente, is_default, active });

describe('risolviTemplateCommittente', () => {
  it('match esatto sul committente attivo', () => {
    const list = [tpl('a', 'acea'), tpl('b', 'italgas'), tpl('d', null, true)];
    expect(risolviTemplateCommittente('italgas', list)).toBe('b');
  });
  it('nessun match committente → ripiega sul default attivo', () => {
    const list = [tpl('a', 'acea'), tpl('d', null, true)];
    expect(risolviTemplateCommittente('altro', list)).toBe('d');
  });
  it('ignora i template non attivi nel match committente', () => {
    const list = [tpl('a', 'acea', false, false), tpl('d', null, true)];
    expect(risolviTemplateCommittente('acea', list)).toBe('d');
  });
  it('ignora i default non attivi', () => {
    const list = [tpl('d', null, true, false)];
    expect(risolviTemplateCommittente('acea', list)).toBeNull();
  });
  it('nessun candidato → null', () => {
    expect(risolviTemplateCommittente('acea', [])).toBeNull();
  });
  it('a parità preferisce il committente esatto al default', () => {
    const list = [tpl('d', null, true), tpl('a', 'acea')];
    expect(risolviTemplateCommittente('acea', list)).toBe('a');
  });
});
