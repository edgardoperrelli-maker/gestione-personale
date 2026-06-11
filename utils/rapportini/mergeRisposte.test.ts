import { describe, it, expect } from 'vitest';
import { mergeRisposte, eStoragePath } from './mergeRisposte';

const PATH_A = 'rapportini/r1/a.jpg';
const PATH_A2 = 'rapportini/r1/a2.jpg';
const PATH_B = 'rapportini/r1/b.jpg';
const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';

describe('eStoragePath', () => {
  it('riconosce un path di storage reale', () => {
    expect(eStoragePath(PATH_A)).toBe(true);
    expect(eStoragePath(PH)).toBe(false);
    expect(eStoragePath('')).toBe(false);
    expect(eStoragePath(null)).toBe(false);
  });
});

describe('mergeRisposte — modalità normale', () => {
  it('le chiavi in arrivo vincono, le assenti restano', () => {
    const out = mergeRisposte({ a: PATH_A, b: PATH_B }, { a: PATH_A2 }, { soloCompletamentoFoto: false });
    expect(out).toEqual({ a: PATH_A2, b: PATH_B });
  });
  it('un salvataggio parziale NON azzera le altre foto (la regressione del bug)', () => {
    const out = mergeRisposte({ a: PATH_A, b: PATH_B, eseguito: 'SI' }, { eseguito: 'SI' }, { soloCompletamentoFoto: false });
    expect(out).toEqual({ a: PATH_A, b: PATH_B, eseguito: 'SI' });
  });
  it('un null esplicito cancella il campo', () => {
    const out = mergeRisposte({ a: PATH_A }, { a: null }, { soloCompletamentoFoto: false });
    expect(out).toEqual({ a: null });
  });
});

describe('mergeRisposte — modalità completamento foto (rapportino inviato)', () => {
  it('applica la transizione segnaposto → path reale', () => {
    const out = mergeRisposte({ a: PH, eseguito: 'SI' }, { a: PATH_A }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PATH_A, eseguito: 'SI' });
  });
  it('NON sovrascrive un path reale già presente', () => {
    const out = mergeRisposte({ a: PATH_A }, { a: PATH_A2 }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PATH_A });
  });
  it('ignora le modifiche a campi non-foto', () => {
    const out = mergeRisposte({ a: PH, note: 'x' }, { a: PATH_A, note: 'y' }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PATH_A, note: 'x' });
  });
  it('ignora una transizione segnaposto → segnaposto (non un path reale)', () => {
    const PH2 = 'blob-locale:22222222-2222-2222-2222-222222222222';
    const out = mergeRisposte({ a: PH }, { a: PH2 }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PH });
  });
});
