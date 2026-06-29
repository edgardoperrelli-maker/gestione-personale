import { describe, it, expect } from 'vitest';
import { rimuoviFotoDaRisposte } from './fotoModifica';

describe('rimuoviFotoDaRisposte', () => {
  it('rimuove il path da un campo-foto array, lasciando gli altri', () => {
    const r = { foto_contatore: ['rapportini/a.jpg', 'rapportini/b.jpg'], note: 'ok' };
    const out = rimuoviFotoDaRisposte(r, 'rapportini/a.jpg');
    expect(out.rimosso).toBe(true);
    expect(out.risposte.foto_contatore).toEqual(['rapportini/b.jpg']);
    expect(out.risposte.note).toBe('ok');
  });

  it('rimuove il path da foto_extra', () => {
    const r = { foto_extra: ['extra/v1/x.jpg', 'extra/v1/y.jpg'] };
    const out = rimuoviFotoDaRisposte(r, 'extra/v1/y.jpg');
    expect(out.rimosso).toBe(true);
    expect(out.risposte.foto_extra).toEqual(['extra/v1/x.jpg']);
  });

  it('campo-foto a stringa singola → diventa array vuoto', () => {
    const r = { foto_sigillo: 'rapportini/s.jpg' };
    const out = rimuoviFotoDaRisposte(r, 'rapportini/s.jpg');
    expect(out.rimosso).toBe(true);
    expect(out.risposte.foto_sigillo).toEqual([]);
  });

  it('path assente → nessuna modifica', () => {
    const r = { foto_extra: ['extra/v1/x.jpg'], note: 'ciao' };
    const out = rimuoviFotoDaRisposte(r, 'rapportini/zzz.jpg');
    expect(out.rimosso).toBe(false);
    expect(out.risposte).toEqual(r);
  });

  it('non tocca i campi di testo che non coincidono col path', () => {
    const r = { note: 'rapportini', foto: ['rapportini/a.jpg'] };
    const out = rimuoviFotoDaRisposte(r, 'rapportini/a.jpg');
    expect(out.risposte.note).toBe('rapportini');
    expect(out.risposte.foto).toEqual([]);
  });

  it('risposte null + path vuoto → no-op sicuro', () => {
    expect(rimuoviFotoDaRisposte(null, 'x').rimosso).toBe(false);
    expect(rimuoviFotoDaRisposte({ foto: ['a'] }, '').rimosso).toBe(false);
  });

  it('non muta l’oggetto originale (copia)', () => {
    const r = { foto: ['a', 'b'] };
    rimuoviFotoDaRisposte(r, 'a');
    expect(r.foto).toEqual(['a', 'b']);
  });
});
