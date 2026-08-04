import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  resolve(__dirname, '../../app/api/acea/ordini/route.ts'),
  'utf8',
);
/** Il sorgente senza commenti: qui si controlla il codice, non le spiegazioni. */
const codice = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const funzione = codice.match(/async function chiudiOrdiniAcqualatinaCompletati[\s\S]*?\n\}/)?.[0] ?? '';

describe('la riconciliazione AcquaLatina legge la voce', () => {
  it("chiede l'esito scritto nel rapportino, non solo quello dell'intervento", () => {
    // `interventi.esito` distingue solo il positivo da tutto il resto: da lì la regola nuova non
    // è esprimibile.
    expect(funzione).not.toBe('');
    expect(funzione).toMatch(/rapportino_voci/);
    expect(funzione).toMatch(/eseguito/);
  });

  it('la guardia protegge SOLO il positivo', () => {
    // Il vecchio ramo negativo riapriva le righe con esito_positivo=false E aperto=false: con la
    // regola nuova quella è la combinazione di una riga chiusa dal NO, e la guardia la
    // riaprirebbe a ogni giro — le due regole si rincorrerebbero.
    expect(funzione).toMatch(/not\('esito_positivo', 'is', true\)/);
    expect(funzione).not.toMatch(/aperto\.is\.false/);
  });

  it('resta best-effort: la lettura delle voci non può far cadere la tabella', () => {
    expect(funzione).toMatch(/catch/);
  });

  it("l'aggancio voce↔intervento non si ricostruisce a posteriori", () => {
    // `completati` e `idInterventi` si riempiono nello stesso ciclo: un secondo passaggio per
    // riappaiarli sarebbe il posto dove si sfalsano.
    expect(funzione).toMatch(/idInterventi\.push\(i\.id\)/);
    expect(funzione).toMatch(/eseguitoPerIntervento\.get\(idInterventi\[i\]\)/);
  });
});
