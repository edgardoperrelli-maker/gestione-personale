import { describe, it, expect } from 'vitest';
import { messaggioErroreManuale } from './messaggioErroreManuale';

describe('messaggioErroreManuale', () => {
  it('usa il dettaglio del server se presente (campi_mancanti)', () => {
    expect(messaggioErroreManuale({ error: 'campi_mancanti', dettaglio: 'Indica PDR/ODL/matricola e via/comune.' }, 422))
      .toBe('Indica PDR/ODL/matricola e via/comune.');
  });
  it('foto mancanti: elenca gli slot', () => {
    expect(messaggioErroreManuale({ error: 'Foto obbligatorie mancanti', mancanti: ['Sigillo', 'Lettura'] }, 422))
      .toBe('Foto obbligatorie mancanti: Sigillo, Lettura');
  });
  it('mappa i codici noti quando manca il dettaglio', () => {
    expect(messaggioErroreManuale({ error: 'campi_mancanti' }, 422)).toMatch(/identificativo/i);
    expect(messaggioErroreManuale({ error: 'non_modificabile' }, 409)).toMatch(/scaduto|inviato/i);
  });
  it('fallback su codice grezzo o status', () => {
    expect(messaggioErroreManuale({ error: 'boh' }, 500)).toBe('boh');
    expect(messaggioErroreManuale({}, 500)).toBe('Errore 500');
  });
});
