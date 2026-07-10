import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leggiFileSal, leggiSal, numeroSalDaNome } from './leggiSal.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-sal-'));

async function creaSal(file: string, righe: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  // ordine colonne volutamente diverso dal file reale: prova la lettura per NOME.
  ws.addRow(['Documento acquisti', 'Posizione', 'Ordine', 'Operazione testo breve', 'Causa scostamento', 'Valore APS', 'Data completamento lavori', 'Data registrazione']);
  for (const r of righe) ws.addRow(r);
  await wb.xlsx.writeFile(file);
}

describe('numeroSalDaNome', () => {
  it('estrae il numero da "SAL N.xlsx"', () => {
    expect(numeroSalDaNome('SAL 1.xlsx')).toBe(1);
    expect(numeroSalDaNome('sal 12.xlsx')).toBe(12);
  });
  it('null se non riconoscibile', () => {
    expect(numeroSalDaNome('ZAGAROLO.xlsx')).toBeNull();
    expect(numeroSalDaNome('')).toBeNull();
  });
  it('non ingerisce "PRE-SAL N.xlsx" come SAL ufficiale (rischio: cifra pagata gonfiata)', () => {
    expect(numeroSalDaNome('PRE-SAL 2.xlsx')).toBeNull();
    expect(numeroSalDaNome('pre-sal 3.xlsx')).toBeNull();
  });
});

describe('leggiFileSal', () => {
  it('legge per nome colonna, righe senza Ordine scartate', async () => {
    const file = path.join(dir, 'SAL 1.xlsx');
    await creaSal(file, [
      ['4206329130', '10', '957276160', 'Limitazione flusso idrico', 'EFRE', 25.46, new Date('2026-06-10'), new Date('2026-07-08')],
      ['4206329130', '20', '', 'Limitazione flusso idrico', 'EFRE', 25.46, new Date('2026-06-10'), new Date('2026-07-08')],
    ]);
    const righe = await leggiFileSal(file);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ odl: '957276160', docAcquisti: '4206329130', posizione: '10', valoreAps: 25.46, causa: 'EFRE', attivita: 'Limitazione flusso idrico' });
    expect(righe[0].dataCompletamentoRaw).toContain('2026');
  });

  it("[] se la colonna Ordine non c'è", async () => {
    const file = path.join(dir, 'nonsal.xlsx');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['Foo', 'Bar']);
    await wb.xlsx.writeFile(file);
    expect(await leggiFileSal(file)).toEqual([]);
  });
});

describe('leggiSal', () => {
  it('legge solo i file "SAL N" della cartella, numera per nome', async () => {
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-sal-dir-'));
    await creaSal(path.join(cartella, 'SAL 1.xlsx'), [['d1', '10', '111', 'X', 'EFRE', 10, new Date(), new Date()]]);
    await creaSal(path.join(cartella, 'SAL 2.xlsx'), [['d2', '10', '222', 'X', 'EFRE', 20, new Date(), new Date()]]);
    fs.writeFileSync(path.join(cartella, 'ZAGAROLO.xlsx'), 'non-xlsx-content'); // file non-SAL, ignorato per nome (mai aperto)

    const out = await leggiSal(cartella);
    expect(out.map((f) => f.n).sort()).toEqual([1, 2]);
    expect(out.find((f) => f.n === 1)!.righe[0].odl).toBe('111');
  });

  it('[] se la cartella non esiste', async () => {
    expect(await leggiSal(path.join(dir, 'assente'))).toEqual([]);
  });
});
