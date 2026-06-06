import { describe, it, expect } from 'vitest';
import { anagraficaCampi } from './anagraficaCampi';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';

describe('anagraficaCampi', () => {
  it('snapshot vuoto → 11 campi storici ordinati (coordinate esclusa)', () => {
    const campi = anagraficaCampi(null);
    expect(campi.map((c) => c.chiave)).not.toContain('coordinate');
    expect(campi[0].chiave).toBe('nominativo');
    expect(campi.length).toBe(11);
  });
  it('rispetta ordine ed etichette dello snapshot', () => {
    const snap: TemplateInfoCampo[] = [
      { chiave: 'pdr', etichetta: 'Punto', ordine: 2 },
      { chiave: 'nominativo', etichetta: 'Cliente', ordine: 1 },
    ];
    const campi = anagraficaCampi(snap);
    expect(campi.map((c) => c.chiave)).toEqual(['nominativo', 'pdr']);
    expect(campi[0].etichetta).toBe('Cliente');
  });
  it('include coordinate se presente nello snapshot', () => {
    const snap: TemplateInfoCampo[] = [{ chiave: 'coordinate', etichetta: 'COORDINATE', ordine: 1 }];
    expect(anagraficaCampi(snap).map((c) => c.chiave)).toContain('coordinate');
  });
});
