import { describe, it, expect } from 'vitest';
import { validaSpostamentoGruppo } from './validaSpostamentoGruppo';

describe('validaSpostamentoGruppo', () => {
  it('gruppo uppercase con spazi collassati, id trimmato', () => {
    const r = validaSpostamentoGruppo({ id: '  abc  ', gruppo: ' picarro  firenze ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valore.id).toBe('abc');
      expect(r.valore.gruppo).toBe('PICARRO FIRENZE');
    }
  });
  it('id mancante → errore', () => {
    const r = validaSpostamentoGruppo({ gruppo: 'PICARRO' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain('ID');
  });
  it('gruppo vuoto o solo spazi → errore (mai un gruppo senza nome)', () => {
    expect(validaSpostamentoGruppo({ id: 'x', gruppo: '' }).ok).toBe(false);
    expect(validaSpostamentoGruppo({ id: 'x', gruppo: '   ' }).ok).toBe(false);
  });
  it('gruppo non stringa → errore (niente coercizione silenziosa)', () => {
    expect(validaSpostamentoGruppo({ id: 'x', gruppo: 3 }).ok).toBe(false);
    expect(validaSpostamentoGruppo({ id: 'x' }).ok).toBe(false);
  });
  it('body non-oggetto → errore', () => {
    expect(validaSpostamentoGruppo(null).ok).toBe(false);
    expect(validaSpostamentoGruppo('x').ok).toBe(false);
  });
});
