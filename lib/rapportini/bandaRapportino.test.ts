import { describe, it, expect } from 'vitest';
import path from 'path';
import { readFileSync } from 'fs';
import ExcelJS from 'exceljs';
import { rigaBanda, preparaBanda, posizionaBanda, BAND_LABEL } from './bandaRapportino';

describe('rigaBanda', () => {
  it('resta a 35 quando i dati ci stanno (≤28)', () => {
    expect(rigaBanda(0)).toBe(35);
    expect(rigaBanda(1)).toBe(35);
    expect(rigaBanda(28)).toBe(35);
  });
  it('scende subito sotto l\'ultimo intervento in overflow (>28)', () => {
    expect(rigaBanda(29)).toBe(36);
    expect(rigaBanda(35)).toBe(42);
    expect(rigaBanda(50)).toBe(57);
  });
});

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
  it('≤28 interventi: la banda resta a riga 35, merge ripristinato', async () => {
    const ws = await caricaTemplate();
    const stili = preparaBanda(ws);
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(false); // preparaBanda l'ha smontata
    for (let i = 0; i < 20; i++) ws.getCell(`A${7 + i}`).value = `Op ${i}`;
    const { bandRow, primaNota } = posizionaBanda(ws, 20, stili);
    expect(bandRow).toBe(35);
    expect(primaNota).toBe(36);
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(true); // ri-mergiata
    expect(ws.getCell('A35').value).toBe(BAND_LABEL);
  });

  it('35 interventi multi-colonna: riga 35 conserva TUTTE le colonne (no collasso), banda a 42', async () => {
    const ws = await caricaTemplate();
    const stili = preparaBanda(ws);
    // scrive PIÙ colonne per riga (A,B,C,L) — è il caso reale dei generatori
    for (let i = 0; i < 35; i++) {
      const r = 7 + i;
      ws.getCell(`A${r}`).value = `Op ${i}`;
      ws.getCell(`B${r}`).value = `mat ${i}`;
      ws.getCell(`C${r}`).value = `pdr ${i}`;
      ws.getCell(`L${r}`).value = i + 1;
    }
    const { bandRow, primaNota } = posizionaBanda(ws, 35, stili);
    expect(bandRow).toBe(42);
    expect(primaNota).toBe(43);
    // riga 35 = 29° intervento (7+28): TUTTE le colonne preservate (regressione del bug di collasso)
    expect(ws.getCell('A35').value).toBe('Op 28');
    expect(ws.getCell('B35').value).toBe('mat 28');
    expect(ws.getCell('C35').value).toBe('pdr 28');
    expect(ws.getCell('L35').value).toBe(29);
    // banda ricostruita sotto, mergiata; nessun merge residuo a 35
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(false);
    expect(mergeAttiva(ws, 'A42:Q42')).toBe(true);
    expect(ws.getCell('A42').value).toBe(BAND_LABEL);
    expect(ws.getCell('Q35').value).not.toBe(BAND_LABEL);
  });
});
