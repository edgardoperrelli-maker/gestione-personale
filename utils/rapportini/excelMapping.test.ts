import { describe, it, expect } from 'vitest';
import { risposteToStandardRow } from './excelMapping';
describe('risposteToStandardRow', () => {
  it('crocetta true → X', () => {
    expect(risposteToStandardRow({ att_cess: true, cambio: false, note: 'ciao' })).toEqual({ att_cess: 'X', cambio: '', mini_bag: '', rg_stop: '', assente: '', note: 'ciao' });
  });
});
