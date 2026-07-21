// Gate d'import della pianificazione: SOLO il template ufficiale è accettato.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { isFileTemplateUfficiale } from './excelParser';
import { buildTemplateImport } from '@/lib/attivita/templateImport';
import { COLONNE_TEMPLATE, FOGLIO_TEMPLATE } from '@/lib/attivita/templateColonne';
import type { TassonomiaRiga } from '@/lib/attivita/tassonomia';

const TASSONOMIA: TassonomiaRiga[] = [
  { committente: 'italgas', descrizione: 'BONIFICHE', descrizioneNorm: 'BONIFICHE', gruppo: 'BONIFICHE', attivo: true },
];

function toFile(buf: ExcelJS.Buffer | Buffer, nome: string): File {
  const src = buf as unknown as Uint8Array;
  const copia = new Uint8Array(src.byteLength);
  copia.set(src);
  return new File([copia.buffer], nome);
}

async function xlsxCon(nomeFoglio: string, header: unknown[]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet(nomeFoglio).addRow(header);
  return toFile(await wb.xlsx.writeBuffer(), 'file.xlsx');
}

describe('isFileTemplateUfficiale', () => {
  it('il template generato dal server → true', async () => {
    const buf = await buildTemplateImport(TASSONOMIA);
    expect(await isFileTemplateUfficiale(toFile(buf, 'template-import-interventi.xlsx'))).toBe(true);
  });

  it('foglio rinominato (header giusto ma non "Interventi") → false', async () => {
    expect(await isFileTemplateUfficiale(await xlsxCon('Foglio1', [...COLONNE_TEMPLATE]))).toBe(false);
  });

  it('template VECCHIO senza COMMITTENTE → false', async () => {
    const vecchio = [...COLONNE_TEMPLATE].filter((c) => c !== 'COMMITTENTE');
    expect(await isFileTemplateUfficiale(await xlsxCon(FOGLIO_TEMPLATE, vecchio))).toBe(false);
  });

  it('formato storico Export Dati → false', async () => {
    const storico = ['CO', 'MATRICOLA', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE', 'PdR / Impianto', 'Nominativo'];
    expect(await isFileTemplateUfficiale(await xlsxCon('Foglio1', storico))).toBe(false);
  });

  it('file corrotto/non Excel → false senza lanciare', async () => {
    expect(await isFileTemplateUfficiale(new File([new TextEncoder().encode('non un excel')], 'x.xlsx'))).toBe(false);
  });
});
