import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
  GUARDIA: i NUMERI si formattano solo con `utils/numero-it` (decisione utente 2026-08-06).

  `toLocaleString('it-IT')` da solo non basta: in ICU l'italiano ha `minimumGroupingDigits = 2`,
  quindi raggruppa da cinque cifre in su e nella stessa fila di KPI convivevano «141.453,71 €» e
  «6115,73 €». `euroIt`/`numeroIt` forzano `useGrouping: 'always'`. Se qualcuno riporta una
  formattazione numerica a mano, questo test lo dice — le DATE restano libere di usare
  `toLocaleString` con le loro opzioni, ed è l'unica eccezione ammessa.
*/
const RADICE = resolve(__dirname, '..');
const CARTELLE = ['app', 'components', 'lib', 'utils'];
const SALTA = new Set(['node_modules', '.next', '.claude']);

function sorgenti(dir: string): string[] {
  const out: string[] = [];
  for (const voce of readdirSync(dir)) {
    if (SALTA.has(voce)) continue;
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) out.push(...sorgenti(p));
    else if (/\.tsx?$/.test(voce)) out.push(p);
  }
  return out;
}

/** Opzioni che rendono la chiamata una formattazione di DATA, non di numero. */
const DATA = /day|month|year|hour|minute|second|weekday|timeZone|dateStyle|timeStyle/;

const file = sorgenti(RADICE.length ? RADICE : '.')
  .filter((f) => CARTELLE.some((c) => f.startsWith(join(RADICE, c))))
  // Si escludono LUI (contiene per forza le stringhe che cerca) e il modulo che le stringhe le
  // implementa: `numero-it.ts` è l'unico posto dove `toLocaleString` numerico è al suo posto.
  .filter((f) => f !== __filename && !f.endsWith(join('utils', 'numero-it.ts')));
const relativo = (f: string) => f.slice(RADICE.length + 1).replace(/\\/g, '/');

describe('formattazione numerica italiana: una sola strada', () => {
  it('il camminatore vede davvero i sorgenti (se no passerebbe a vuoto)', () => {
    expect(file.length).toBeGreaterThan(300);
  });

  it('nessun sorgente formatta NUMERI con toLocaleString/Intl al posto di numero-it', () => {
    const colpevoli: string[] = [];
    for (const f of file) {
      const testo = readFileSync(f, 'utf8');
      // `X.toLocaleString('it-IT')` e `X.toLocaleString('it-IT', { … })`: numero se fra le
      // opzioni non compare nulla di temporale.
      for (const m of testo.matchAll(/toLocaleString\('it-IT'(?:,\s*\{([^{}]*)\})?\)/g)) {
        if (m[1] && DATA.test(m[1])) continue; // opzioni temporali: è una data
        // Senza opzioni la firma non dice nulla, ma il ricevente sì: il `toLocaleString` di un
        // `Date` non è mai un numero (rende «06/08/2026, 10:42»).
        const prima = testo.slice(Math.max(0, m.index - 60), m.index);
        if (/\bDate\([^()]*\)\s*\.\s*$/.test(prima)) continue;
        colpevoli.push(`${relativo(f)} → ${m[0].slice(0, 60)}`);
      }
      if (/new Intl\.NumberFormat\(/.test(testo)) colpevoli.push(`${relativo(f)} → Intl.NumberFormat`);
    }
    expect(colpevoli).toEqual([]);
  });
});
