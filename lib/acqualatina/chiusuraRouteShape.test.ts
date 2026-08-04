import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  La riconciliazione non vive più dentro /api/acea/ordini: è estratta in
  `riconciliaRegistro.ts` perché anche il confronto esiti col sito la fa girare prima di
  leggere il registro. Gli invarianti di forma restano gli stessi, sul file nuovo.
*/
const sorgente = readFileSync(resolve(__dirname, './riconciliaRegistro.ts'), 'utf8');
/** Il sorgente senza commenti: qui si controlla il codice, non le spiegazioni. */
const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const funzione = codice.match(/export async function riconciliaChiusureAcqualatina[\s\S]*?\n\}/)?.[0] ?? '';

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
    // L'`id` viaggia DENTRO ogni concluso (select con `id` e push col campo `id`): l'esito
    // della voce si riprende per chiave, mai riappaiando due array per indice — il posto
    // dove si sfalserebbero.
    expect(funzione).toMatch(/select\('id, ordine_id, data, esito'\)/);
    expect(funzione).toMatch(/eseguitoPerIntervento\.get\(c\.id\)/);
  });

  it('entrambe le porte di lettura la fanno girare', () => {
    // La tabella del registro e il confronto esiti guardano lo stesso registro: una riconciliata
    // e una no è il «sempre 84» del 04/08.
    for (const porta of ['../../app/api/acea/ordini/route.ts', '../../app/api/acqualatina/esiti/confronto/route.ts']) {
      expect(readFileSync(resolve(__dirname, porta), 'utf8')).toMatch(/riconciliaChiusureAcqualatina\(\)/);
    }
  });
});
