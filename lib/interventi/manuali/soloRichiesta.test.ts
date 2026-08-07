import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSoloRichiesta, COMMITTENTI_SOLO_RICHIESTA } from './soloRichiesta';

describe('isSoloRichiesta', () => {
  it('acqualatina sì: il "+" lì è una richiesta di assegnazione, non un lavoro fatto', () => {
    expect(isSoloRichiesta('acqualatina')).toBe(true);
  });
  it('gli altri committenti no', () => {
    for (const c of ['acea', 'italgas', 'lim_massive', 'altro']) expect(isSoloRichiesta(c)).toBe(false);
  });
  it('committente assente o vuoto → false (non si spegne un obbligo per una svista)', () => {
    expect(isSoloRichiesta(null)).toBe(false);
    expect(isSoloRichiesta(undefined)).toBe(false);
    expect(isSoloRichiesta('')).toBe(false);
  });
  it('confronto esatto, niente scorciatoie sul caso', () => {
    expect(isSoloRichiesta('ACQUALATINA')).toBe(false);
    expect(isSoloRichiesta(' acqualatina')).toBe(false);
  });
  it('la lista è quella dichiarata', () => {
    expect([...COMMITTENTI_SOLO_RICHIESTA]).toEqual(['acqualatina']);
  });
});

// Il predicato serve a nulla se una delle due metà smette di usarlo: è proprio dalla
// divergenza fra modale e route che nasce il 422 insanabile.
describe('guardia: modale e route usano lo STESSO predicato', () => {
  const leggi = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

  // Solo la FORMA DEL FLUSSO passa dal predicato. La scelta del componente di ricerca resta un
  // confronto esplicito sul committente, ed è giusto così: ACEA e AcquaLatina hanno semantiche
  // opposte sul misuratore non censito, e non è la stessa domanda.
  it('la modale ricava soloRichiesta dal predicato, non da un confronto a mano', () => {
    const modale = leggi('components', 'modules', 'rapportini', 'ModaleInterventoManuale.tsx');
    expect(modale).toMatch(/const soloRichiesta = isSoloRichiesta\(committente\)/);
    expect(modale).not.toMatch(/soloRichiesta = committente === /);
  });

  it('la route spegne il cancello foto passando dallo stesso predicato', () => {
    // Il predicato è dentro `campiGateFoto` (gateFotoManuale.ts), che la route chiama col
    // committente: la guardia fissa la catena, non il testo della condizione.
    const route = leggi('app', 'api', 'r', '[token]', 'intervento-manuale', 'route.ts');
    expect(route).toMatch(/campiGateFoto\(committente, overrideCampi, standardCampi\)/);
    expect(leggi('lib', 'interventi', 'manuali', 'gateFotoManuale.ts')).toMatch(/isSoloRichiesta\(committente\)/);
  });

  it('anche la pre-validazione offline lo usa', () => {
    expect(leggi('lib', 'offline', 'validateManuale.ts')).toMatch(/isSoloRichiesta\(args\.committente\)/);
  });
});
