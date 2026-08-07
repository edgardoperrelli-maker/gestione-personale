import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  `matricola_nuova` è un dato AcquaLatina: nasce dal campo «MATRICOLA NUOVO MISURATORE», che
  esiste in UN solo flusso di Azioni operatori. Il registro era già protetto dal committente
  (`propagaMatricolaNuovaARegistro`); la scrittura su `interventi.matricola_nuova` no — e nel
  07-08/2026, quando il modulo AcquaLatina è finito per ripiego sui giri ACEA e Italgas, i
  valori scritti per superare l'obbligatorio («0», «-», matricole di contatori GAS) sono
  atterrati su interventi di altri committenti. Da lì l'export interventi li avrebbe portati
  in un report del committente sbagliato.

  Qui si controlla la FORMA delle due corsie di scrittura, non il comportamento a runtime:
  è l'unico modo di far fallire la rimozione della guardia in una modifica futura.
*/
const leggi = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
/** Il sorgente senza commenti: si controlla il codice, non le spiegazioni. */
const soloCodice = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('la matricola del misuratore nuovo non esce da AcquaLatina', () => {
  it('il salvataggio live dell’operatore controlla il committente prima di scriverla', () => {
    const codice = soloCodice(leggi('../../app/api/r/[token]/voce/route.ts'));
    // Il valore effettivamente scritto passa da una variabile che si valorizza solo su acqualatina.
    expect(codice).toMatch(/select\('committente'\)/);
    expect(codice).toMatch(/committente === 'acqualatina'/);
    // …e resta null altrimenti: nessun ramo che assegni la risposta grezza senza il controllo.
    expect(codice).toMatch(/let matricolaNuova: string \| null = null/);
    expect(codice).toMatch(/matricola_nuova: matricolaNuova/);
  });

  it('la propagazione al registro tiene la sua guardia sul committente', () => {
    const funzione = soloCodice(leggi('./matricolaNuova.ts'))
      .match(/export async function propagaMatricolaNuovaARegistro[\s\S]*?\n\}/)?.[0] ?? '';
    expect(funzione).not.toBe('');
    expect(funzione).toMatch(/committente !== 'acqualatina'/);
  });
});
