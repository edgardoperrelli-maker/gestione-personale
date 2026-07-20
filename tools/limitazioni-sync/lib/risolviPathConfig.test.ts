// tools/limitazioni-sync/lib/risolviPathConfig.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { risolviPathConfig } from './risolviPathConfig.mjs';

/** Albero commessa: <radice>/<nome>/8_LAVORI/LIMITAZIONI MASSIVE (+ eventuali xlsx). */
function creaCommessa(radice: string, nome: string, xlsx: string[] = []) {
  const massive = path.join(radice, nome, '8_LAVORI', 'LIMITAZIONI MASSIVE');
  fs.mkdirSync(massive, { recursive: true });
  for (const f of xlsx) fs.writeFileSync(path.join(massive, f), 'x');
  return massive;
}

function cfgPer(radice: string, commessa: string) {
  const base = path.join(radice, commessa, '8_LAVORI');
  return {
    endpointUrl: 'https://esempio.test/api',
    cartella: path.join(base, 'LIMITAZIONI MASSIVE'),
    acea: {
      salPath: path.join(base, "CONTABILITA'"),
      masterPath: path.join(base, 'DUNNING', '2026', 'LIMITAZIONI CON ORDINE.xlsx'),
      zagarolo: { masterPath: path.join(base, 'LIMITAZIONI MASSIVE', 'ZAGAROLO.xlsx') },
    },
  };
}

describe('risolviPathConfig', () => {
  it('cartella esistente con master: config invariato, nessun avviso', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    creaCommessa(radice, 'CP 20260002_ACEA', ['ZAGAROLO.xlsx']);
    const cfg = cfgPer(radice, 'CP 20260002_ACEA');

    const out = risolviPathConfig(cfg);
    expect(out.avviso).toBeNull();
    expect(out.cfg).toBe(cfg); // stesso riferimento: nessuna copia inutile
  });

  it('commessa rinominata con UNA gemella valida: riscrive TUTTI i path e avvisa', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    creaCommessa(radice, '20260002_ACEA', ['ZAGAROLO.xlsx']); // nome nuovo, con master
    const cfg = cfgPer(radice, 'CP 20260002_ACEA'); // config ancora sul nome vecchio (inesistente)

    const out = risolviPathConfig(cfg);
    expect(out.avviso).toMatch(/CP 20260002_ACEA/);
    expect(out.avviso).toMatch(/20260002_ACEA/);
    const nuovoBase = path.join(radice, '20260002_ACEA', '8_LAVORI');
    expect(out.cfg.cartella).toBe(path.join(nuovoBase, 'LIMITAZIONI MASSIVE'));
    expect(out.cfg.acea.salPath).toBe(path.join(nuovoBase, "CONTABILITA'"));
    expect(out.cfg.acea.masterPath).toBe(path.join(nuovoBase, 'DUNNING', '2026', 'LIMITAZIONI CON ORDINE.xlsx'));
    expect(out.cfg.acea.zagarolo.masterPath).toBe(path.join(nuovoBase, 'LIMITAZIONI MASSIVE', 'ZAGAROLO.xlsx'));
    expect(out.cfg.endpointUrl).toBe('https://esempio.test/api'); // le non-path restano intatte
    expect(cfg.cartella).toContain('CP 20260002_ACEA'); // l'originale non viene mutato
  });

  it('nessuna candidata: config invariato e avviso di non-risolvibile', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    const cfg = cfgPer(radice, 'CP 20260002_ACEA'); // non esiste nulla

    const out = risolviPathConfig(cfg);
    expect(out.cfg).toBe(cfg);
    expect(out.avviso).toMatch(/non trovata/i);
  });

  it('gemella con albero ma SENZA master xlsx: non conta come candidata', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    creaCommessa(radice, '20260002_ACEA', []); // albero giusto ma vuoto (es. fantasma)
    const cfg = cfgPer(radice, 'CP 20260002_ACEA');

    const out = risolviPathConfig(cfg);
    expect(out.cfg).toBe(cfg);
    expect(out.avviso).toMatch(/non trovata/i);
  });

  it('DUE candidate valide: ambiguo, config invariato e avviso', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    creaCommessa(radice, '20260002_ACEA', ['ZAGAROLO.xlsx']);
    creaCommessa(radice, '20260002_ACEA_BIS', ['ZAGAROLO.xlsx']);
    const cfg = cfgPer(radice, 'CP 20260002_ACEA');

    const out = risolviPathConfig(cfg);
    expect(out.cfg).toBe(cfg);
    expect(out.avviso).toMatch(/ambigu/i);
  });

  it('cartella config ESISTENTE ma senza master (fantasma) + gemella vera: risolve', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    creaCommessa(radice, 'CP 20260002_ACEA', []); // fantasma: albero vuoto (es. ricreato da un log writer)
    creaCommessa(radice, '20260002_ACEA', ['ZAGAROLO.xlsx']); // la commessa vera
    const cfg = cfgPer(radice, 'CP 20260002_ACEA');

    const out = risolviPathConfig(cfg);
    expect(out.avviso).toMatch(/20260002_ACEA/);
    expect(out.cfg.cartella).toBe(path.join(radice, '20260002_ACEA', '8_LAVORI', 'LIMITAZIONI MASSIVE'));
  });

  it('cartella config esistente e vuota SENZA gemella: invariato e nessun avviso (vuota legittima)', () => {
    const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-risolvi-'));
    creaCommessa(radice, 'CP 20260002_ACEA', []); // vuota, ma nessuna alternativa in giro
    // una sorella con xlsx ma SENZA il resto distintivo non deve mai agganciare:
    fs.mkdirSync(path.join(radice, 'ALTRA CARTELLA'), { recursive: true });
    fs.writeFileSync(path.join(radice, 'ALTRA CARTELLA', 'QUALCOSA.xlsx'), 'x');
    const cfg = cfgPer(radice, 'CP 20260002_ACEA');

    const out = risolviPathConfig(cfg);
    expect(out.cfg).toBe(cfg);
    expect(out.avviso).toBeNull();
  });
});
