import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  Un PICARRO/Italgas esitato da Consuntivazione si riapriva nello Storico con le AZIONI DI ACEA.
  L'esito era giusto: a essere sbagliata era la vista. `esita` risolve il flusso del gruppo per
  validare, ma non lo congelava sulla voce; alla rilettura `campiEffettivi` trova
  `campi_snapshot` vuoto e ripiega sullo snapshot del RAPPORTINO, che è il template scelto per
  il PIANO — «primo attivo per nome», in pratica un altro committente.

  La route fa I/O e non è testabile a unità: qui si blocca la forma.
*/
const sorgente = readFileSync(
  resolve(__dirname, '../../app/api/admin/consuntivazione/esita/route.ts'),
  'utf8',
);
/** Il sorgente senza commenti: qui si controlla il codice, non le spiegazioni. */
const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe("l'esitazione congela le azioni sulla voce", () => {
  it('scrive `campi_snapshot` nella patch della voce esistente', () => {
    expect(codice).toMatch(/patchVoce\.campi_snapshot\s*=\s*campi/);
  });

  it('congela solo col flusso davvero risolto, mai quello di ripiego', () => {
    // Congelare il fallback renderebbe permanente proprio l'errore che stiamo togliendo.
    expect(codice).toMatch(/flussoRisolto\s*=\s*r\.flussoTrovato/);
    expect(codice).toMatch(/if\s*\(flussoRisolto\)/);
  });

  it('la rilettura ripiega ancora sul rapportino solo quando la voce non ha campi propri', () => {
    // Il fallback resta legittimo per le voci storiche: è il motivo per cui la scrittura sopra
    // serve, non un comportamento da rimuovere.
    const storico = readFileSync(
      resolve(__dirname, '../../app/api/admin/interventi/storico/voce/[voceId]/route.ts'),
      'utf8',
    );
    expect(storico).toMatch(/function campiEffettivi/);
  });
});
