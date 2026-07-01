import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbookProduzione } from './exportExcel';

type Dati = Parameters<typeof buildWorkbookProduzione>[0];

const dati = {
  from: '2026-06-01',
  to: '2026-06-30',
  listino: [],
  produzione: {
    totale: { conteggio: 3, valore: 300 },
    perVoce: [
      { chiave: 'EL', label: 'EL', conteggio: 2, valore: 200 },
      { chiave: 'ES', label: 'ES', conteggio: 1, valore: 100 },
    ],
    perAttivita: [{ chiave: 'LIMITAZIONE', label: 'Limitazione', conteggio: 3, valore: 300 }],
    perOperatore: [{ chiave: 's1', label: 'ROSSI', conteggio: 3, valore: 300 }],
    perTerritorio: [{ chiave: 't1', label: 'Roma', conteggio: 3, valore: 300 }],
    perGiorno: [{ chiave: '2026-06-01', label: '2026-06-01', conteggio: 3, valore: 300 }],
    nonRisolte: 0,
  },
  sal: { totale: { conteggio: 2, valore: 200 }, perVoce: [{ chiave: 'EL', label: 'EL', conteggio: 2, valore: 200 }] },
  scarto: { conteggio: 1, valore: 100 },
  audit: [{ odl: 'o1', classe: 'POSITIVO_DB_NON_COMPLETATO_PORTALE' }],
  auditSummary: {
    SOLO_PORTALE: 0,
    DB_NON_IN_MASTER: 0,
    MASTER_NON_IN_DB: 0,
    POSITIVO_DB_NON_COMPLETATO_PORTALE: 1,
    COMPLETATO_PORTALE_NON_POSITIVO_DB: 0,
    VOCE_DISCORDE: 0,
    VOCE_NON_RISOLTA: 0,
  },
  auditTotale: 1,
  auditTruncated: false,
} as unknown as Dati;

describe('buildWorkbookProduzione', () => {
  it('produce un xlsx valido e ri-leggibile con i fogli attesi', async () => {
    const buf = await buildWorkbookProduzione(dati);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);

    const nomi = wb.worksheets.map((w) => w.name);
    expect(nomi).toContain('Dashboard');
    expect(nomi).toContain('Dati - per voce');
    expect(nomi).toContain('Dati - operatori');
    expect(nomi).toContain('Dati - audit');

    expect(String(wb.getWorksheet('Dashboard')!.getCell('A1').value)).toContain('Produzione economica');

    // il foglio "Dati - per voce" ha le 2 voci sotto l'intestazione
    const dv = wb.getWorksheet('Dati - per voce')!;
    expect(dv.getCell('B2').value).toBe(2); // ordini EL
    expect(dv.getCell('C2').value).toBe(200); // produzione EL
  });
});
