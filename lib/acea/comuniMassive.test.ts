import { describe, it, expect } from 'vitest';
import { comuniMassiveDaRegistro } from './comuniMassive';

describe('comuniMassiveDaRegistro', () => {
  it('prende i comuni delle sole righe massive', () => {
    expect(comuniMassiveDaRegistro([
      { famiglia: 'massive', comune: 'ZAGAROLO' },
      { famiglia: 'massive', comune: 'LABICO' },
      { famiglia: 'dunning', comune: 'ROMA' },      // il dunning non fa comune massivo
      { famiglia: 'dunning', comune: 'TIVOLI' },
    ])).toEqual(['LABICO', 'ZAGAROLO']);
  });

  it('deduplica e normalizza come i nomi dei master', () => {
    expect(comuniMassiveDaRegistro([
      { famiglia: 'massive', comune: 'zagarolo' },
      { famiglia: 'massive', comune: '  ZAGAROLO ' },
      { famiglia: 'massive', comune: 'Labico' },
    ])).toEqual(['LABICO', 'ZAGAROLO']);
  });

  it('ordina in italiano', () => {
    const c = comuniMassiveDaRegistro([
      { famiglia: 'massive', comune: 'ZAGAROLO' },
      { famiglia: 'massive', comune: 'ANTICOLI CORRADO' },
      { famiglia: 'massive', comune: 'LABICO' },
    ]);
    expect(c).toEqual(['ANTICOLI CORRADO', 'LABICO', 'ZAGAROLO']);
  });

  it('scarta comuni vuoti e registro vuoto', () => {
    expect(comuniMassiveDaRegistro([{ famiglia: 'massive', comune: null }])).toEqual([]);
    expect(comuniMassiveDaRegistro([{ famiglia: 'massive', comune: '  ' }])).toEqual([]);
    expect(comuniMassiveDaRegistro([])).toEqual([]);
  });

  it('un comune nuovo entra da solo, senza toccare il codice', () => {
    // È la proprietà della fonte attuale che va preservata: aggiungere un comune non deve
    // richiedere una modifica al codice né un file nuovo in una cartella.
    expect(comuniMassiveDaRegistro([
      { famiglia: 'massive', comune: 'ZAGAROLO' },
      { famiglia: 'massive', comune: 'SAN CESAREO' },
    ])).toContain('SAN CESAREO');
  });
});
