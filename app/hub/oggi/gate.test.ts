import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Test source-reading (pattern lib/acea/topOperatoreShape.test.ts): fissa la FORMA
// del gate della home operatore, che i test runtime non possono coprire (server
// component con redirect).
const pagina = readFileSync(resolve(__dirname, './page.tsx'), 'utf8');

describe('gate di /hub/oggi', () => {
  it('senza utente autenticato si torna al login', () => {
    expect(pagina).toMatch(/if \(!user\) redirect\('\/login'\)/);
  });

  it("senza il modulo 'oggi' si rimbalza all'hub (pattern /hub/live)", () => {
    expect(pagina).toMatch(/allowedModules\.includes\('oggi'\)/);
    expect(pagina).toMatch(/redirect\('\/hub'\)/);
  });

  it('sempre dinamica: i conteggi sono di OGGI, niente cache', () => {
    expect(pagina).toMatch(/export const dynamic = 'force-dynamic'/);
  });

  it("lo staff si risolve dal ponte utenza→operatore (staff.user_id)", () => {
    expect(pagina).toMatch(/\.eq\('user_id', user\.id\)/);
  });

  it('il rapportino del giorno è quello di oggi Europe/Rome, per lo staff collegato', () => {
    expect(pagina).toMatch(/Europe\/Rome/);
    expect(pagina).toMatch(/\.eq\('staff_id', staffRow\.id\)/);
    expect(pagina).toMatch(/\.eq\('data', oggi\)/);
  });

  it('gli ODL TOP si leggono dal registro, best-effort come /r', () => {
    expect(pagina).toMatch(/from\('acea_ordini'\)/);
    const blocco = pagina.match(/conteggioTop[\s\S]{0,900}/)?.[0] ?? '';
    expect(blocco).toMatch(/console\.error/);
  });
});
