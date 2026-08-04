import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
  L'agente Playwright è stato ritirato il 04/08/2026 (spec
  docs/superpowers/specs/2026-08-04-rimozione-agente-design.md). Questo test è la guardia: un
  import verso `@/lib/agente` o un riferimento a `tools/limitazioni-sync` in un sorgente
  dell'app significa che è rimasto — o tornato — un filo attaccato a codice che non esiste.
*/
const RADICE = resolve(__dirname, '../..');
const CARTELLE = ['app', 'components', 'lib'];
// `.claude` contiene worktree di sessioni passate: sono altri checkout, non questo codice.
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

// Il file-guardia contiene per forza le stringhe che cerca: senza questa riga si
// denuncerebbe da solo. Si esclude LUI e basta — non i test in blocco, perché un
// test che reintroducesse un import verso l'agente è proprio il caso da vedere.
const file = CARTELLE.flatMap((c) => sorgenti(join(RADICE, c))).filter((f) => f !== __filename);
const relativo = (f: string) => f.slice(RADICE.length + 1).replace(/\\/g, '/');

describe("l'agente Playwright è ritirato (04/08/2026)", () => {
  it('il camminatore vede davvero i sorgenti (se no, il test passerebbe a vuoto)', () => {
    // Senza questa asserzione un bug nel walker renderebbe verdi tutte le altre gratis.
    // Soglia larga apposta: i sorgenti sono ~960 dopo la rimozione, e questo numero deve
    // reggere la crescita normale del progetto senza diventare un test da aggiornare.
    expect(file.length).toBeGreaterThan(500);
  });

  it('nessun sorgente importa da lib/agente', () => {
    const colpevoli = file.filter((f) => readFileSync(f, 'utf8').includes('@/lib/agente/'));
    expect(colpevoli.map(relativo)).toEqual([]);
  });

  it('nessun sorgente nomina tools/limitazioni-sync', () => {
    const colpevoli = file.filter((f) => readFileSync(f, 'utf8').includes('tools/limitazioni-sync'));
    expect(colpevoli.map(relativo)).toEqual([]);
  });

  it('le cartelle dell\'agente non esistono più', () => {
    const cartelle = ['lib/agente', 'app/api/agente', 'app/api/admin/agente', 'tools/limitazioni-sync'];
    const rimaste = cartelle.filter((d) => existsSync(join(RADICE, d)));
    expect(rimaste).toEqual([]);
  });

  it('partiRoma sta fuori: la usano sei endpoint vivi di ACEA e AcquaLatina', () => {
    // Il ritiro non doveva portarsi via un helper condiviso. Qui si prova che non l'ha fatto.
    expect(existsSync(join(RADICE, 'lib/orarioRoma.ts'))).toBe(true);
  });
});
