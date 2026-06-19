import { describe, it, expect } from 'vitest';
import { rigaBanda } from './bandaRapportino';

describe('rigaBanda', () => {
  it('resta a 35 quando i dati ci stanno (≤28)', () => {
    expect(rigaBanda(0)).toBe(35);
    expect(rigaBanda(1)).toBe(35);
    expect(rigaBanda(28)).toBe(35); // righe 7..34 = 28 interventi
  });
  it('scende subito sotto l\'ultimo intervento in overflow (>28)', () => {
    expect(rigaBanda(29)).toBe(36); // 7+29
    expect(rigaBanda(35)).toBe(42);
    expect(rigaBanda(50)).toBe(57);
  });
});

import path from 'path';
import { readFileSync } from 'fs';
import ExcelJS from 'exceljs';
import { catturaStili, posizionaBanda, BAND_LABEL } from './bandaRapportino';

async function caricaTemplate(): Promise<ExcelJS.Worksheet> {
  const file = path.join(process.cwd(), 'public', 'templates', 'Rapportino.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

function mergeAttiva(ws: ExcelJS.Worksheet, range: string): boolean {
  const merges: string[] = ((ws as unknown as { model?: { merges?: string[] } }).model?.merges) ?? [];
  return merges.includes(range);
}

describe('posizionaBanda (integration, template reale)', () => {
  it('≤28 interventi: la banda resta a riga 35, merge intatto', async () => {
    const ws = await caricaTemplate();
    const stili = catturaStili(ws);
    for (let i = 0; i < 20; i++) ws.getCell(`A${7 + i}`).value = `Op ${i}`; // 20 interventi
    const { bandRow, primaNota } = posizionaBanda(ws, 20, stili);
    expect(bandRow).toBe(35);
    expect(primaNota).toBe(36);
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(true);
    expect(ws.getCell('A35').value).toBe(BAND_LABEL);
  });

  it('35 interventi: banda a riga 42, i dati su riga 35 restano visibili (no merge sopra)', async () => {
    const ws = await caricaTemplate();
    const stili = catturaStili(ws);
    for (let i = 0; i < 35; i++) ws.getCell(`A${7 + i}`).value = `Op ${i}`; // righe 7..41
    const { bandRow, primaNota } = posizionaBanda(ws, 35, stili);
    expect(bandRow).toBe(42);
    expect(primaNota).toBe(43);
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(false);
    expect(ws.getCell('A35').value).toBe('Op 28'); // 7+28 = riga 35
    expect(mergeAttiva(ws, 'A42:Q42')).toBe(true);
    expect(ws.getCell('A42').value).toBe(BAND_LABEL);
    expect(ws.getCell('Q35').value).not.toBe(BAND_LABEL);
  });
});
