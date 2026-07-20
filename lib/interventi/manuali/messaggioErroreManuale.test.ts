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
    expect(messaggioErroreManuale({ error: 'matricola_gia_eseguita' }, 409)).toMatch(/già eseguito/i);
  });
  it('matricola già eseguita: usa il dettaglio del server (blocco anti-duplicato all\'invio)', () => {
    expect(messaggioErroreManuale({ error: 'matricola_gia_eseguita', dettaglio: "Intervento già eseguito su questo misuratore. Contatta l'ufficio per la verifica." }, 409))
      .toMatch(/già eseguito/i);
  });
  it('fallback su codice grezzo o status', () => {
    expect(messaggioErroreManuale({ error: 'boh' }, 500)).toBe('boh');
    expect(messaggioErroreManuale({}, 500)).toBe('Errore 500');
  });
  it('usa il messaggio del server se presente (anche per codici non in mappa)', () => {
    expect(messaggioErroreManuale({ error: 'codice_ignoto', messaggio: 'Testo amichevole dal server.' }, 400))
      .toBe('Testo amichevole dal server.');
  });
  it('mappa i codici attività (spec §7) quando manca il messaggio', () => {
    expect(messaggioErroreManuale({ error: 'attivita_obbligatoria' }, 400)).toBe('Scegli la descrizione attività: è obbligatoria.');
    expect(messaggioErroreManuale({ error: 'attivita_sconosciuta' }, 400)).toMatch(/non riconosciuta/i);
  });
});
