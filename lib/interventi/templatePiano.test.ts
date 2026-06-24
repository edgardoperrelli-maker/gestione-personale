// lib/interventi/templatePiano.test.ts
// Recupero del template "stabilito" di un piano dai rapportini già esistenti.
import { describe, it, expect } from 'vitest';
import { pickTemplateId } from './templatePiano';

describe('pickTemplateId', () => {
  it('ritorna null quando non ci sono rapportini', () => {
    expect(pickTemplateId([])).toBeNull();
  });

  it('ritorna null quando nessun rapportino ha un template', () => {
    expect(pickTemplateId([{ template_id: null }, { template_id: null }])).toBeNull();
  });

  it('ritorna il template valorizzato, ignorando i null', () => {
    expect(pickTemplateId([{ template_id: null }, { template_id: 'tplB' }])).toBe('tplB');
  });

  it('a fronte di template misti ritorna il più frequente', () => {
    expect(
      pickTemplateId([{ template_id: 'tplA' }, { template_id: 'tplB' }, { template_id: 'tplB' }]),
    ).toBe('tplB');
  });
});
