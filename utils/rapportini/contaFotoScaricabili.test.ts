import { describe, it, expect } from 'vitest';
import { contaFotoScaricabili } from './contaFotoScaricabili';

const PATH = 'rapportini/r1/a.jpg';
const PATH2 = 'rapportini/r1/b.jpg';
const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';

describe('contaFotoScaricabili', () => {
  it('0 con risposte vuote/null o senza campi foto', () => {
    expect(contaFotoScaricabili(null, ['a'])).toBe(0);
    expect(contaFotoScaricabili({}, ['a'])).toBe(0);
    expect(contaFotoScaricabili({ a: PATH }, [])).toBe(0);
  });
  it('conta solo i path reali, ignora i segnaposto', () => {
    expect(contaFotoScaricabili({ a: PATH, b: PH }, ['a', 'b'])).toBe(1);
  });
  it('conta i path negli array', () => {
    expect(contaFotoScaricabili({ a: [PATH, PH, PATH2] }, ['a'])).toBe(2);
  });
  it('ignora le chiavi non-foto', () => {
    expect(contaFotoScaricabili({ a: PATH, note: PATH2 }, ['a'])).toBe(1);
  });
});
