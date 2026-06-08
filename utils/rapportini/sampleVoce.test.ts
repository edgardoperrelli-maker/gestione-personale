import { describe, it, expect } from 'vitest';
import { sampleRisposte, SAMPLE_VOCE_INFO } from './sampleVoce';
import type { TemplateCampo } from './buildVoci';

describe('sampleRisposte', () => {
  it('genera un valore d\'esempio coerente per ogni tipo', () => {
    const campi: TemplateCampo[] = [
      { chiave: 'a', etichetta: 'A', tipo: 'crocetta', ordine: 1 },
      { chiave: 'b', etichetta: 'B', tipo: 'testo', ordine: 2 },
      { chiave: 'c', etichetta: 'C', tipo: 'numero', ordine: 3 },
      { chiave: 'd', etichetta: 'D', tipo: 'select', opzioni: ['X', 'Y'], ordine: 4 },
    ];
    const r = sampleRisposte(campi);
    expect(typeof r.a).toBe('boolean');
    expect(r.b).toBe('esempio');
    expect(r.c).toBe('1');
    expect(r.d).toBe('X');
  });
  it('select senza opzioni → fallback', () => {
    expect(sampleRisposte([{ chiave: 's', etichetta: 'S', tipo: 'select', ordine: 1 }]).s).toBe('Opzione');
  });
  it('template vuoto → {}', () => {
    expect(sampleRisposte([])).toEqual({});
  });
  it('SAMPLE_VOCE_INFO contiene la coordinata d\'esempio', () => {
    expect(SAMPLE_VOCE_INFO.coordinate).toBe('41.853305, 12.782855');
  });
});
