import { describe, it, expect } from 'vitest';
import { COLONNE_TEMPLATE, isHeaderTemplateUfficiale } from './templateColonne';

describe('isHeaderTemplateUfficiale', () => {
  it('header esatto del template → true', () => {
    expect(isHeaderTemplateUfficiale([...COLONNE_TEMPLATE])).toBe(true);
  });

  it('tollera maiuscole/minuscole, spazi doppi e celle vuote in coda', () => {
    const header = [...COLONNE_TEMPLATE].map((c) => ` ${String(c).toLowerCase()}  `.replace('attività', 'ATTIVITÀ'));
    expect(isHeaderTemplateUfficiale([...header, '', ''])).toBe(true);
  });

  it('template VECCHIO senza COMMITTENTE → false (serve quello aggiornato)', () => {
    const vecchio = [...COLONNE_TEMPLATE].filter((c) => c !== 'COMMITTENTE');
    expect(isHeaderTemplateUfficiale(vecchio)).toBe(false);
  });

  it('colonne extra o ordine diverso → false', () => {
    expect(isHeaderTemplateUfficiale([...COLONNE_TEMPLATE, 'EXTRA'])).toBe(false);
    const scambiate = [...COLONNE_TEMPLATE];
    [scambiate[0], scambiate[1]] = [scambiate[1], scambiate[0]];
    expect(isHeaderTemplateUfficiale(scambiate)).toBe(false);
  });

  it('formati storici (Export Dati / ATTGIORN) → false', () => {
    expect(isHeaderTemplateUfficiale(['CO', 'MATRICOLA', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE', 'PdR / Impianto', 'Nominativo'])).toBe(false);
    expect(isHeaderTemplateUfficiale(['', 'RISORSA', '', '', '', '', '', '', '', '', '', 'ATTIVITA', 'CODICE'])).toBe(false);
    expect(isHeaderTemplateUfficiale([])).toBe(false);
  });
});
