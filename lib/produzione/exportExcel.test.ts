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
  sal: {
    totale: { conteggio: 2, valore: 200 },
    perVoce: [{ chiave: 'EL', label: 'EL', conteggio: 2, valore: 200 }],
    perGiorno: [{ chiave: '2026-06-01', label: '2026-06-01', conteggio: 2, valore: 200 }],
  },
  scarto: { conteggio: 1, valore: 100 },
  salStorico: [{ n: 1, mese: '2026-06', ordini: 2, valoreAps: 200, valoreListino: 190, deltaListino: 10, odlSconosciuti: 0 }],
  preSal: { n: 2, totale: { conteggio: 1, valore: 90 } },
  fuoriSal: { conteggio: 1, valore: 80 },
  personale: {
    totaleGiornate: 1.5,
    operatoriAttivi: 1,
    valoreFeriale: 250,
    sabato: { giornate: 0.5, valore: 50 },
    perOperatore: [{ chiave: 's1', label: 'ROSSI', giornate: 1.5, interventiAcea: 3, valore: 300, valoreFeriale: 250, resa: 166.67 }],
    perGiorno: [{ data: '2026-06-01', dedicate: 1, saturazione: 0.5, operatori: 2 }],
  },
  esiti: [{ chiave: 's1', label: 'ROSSI', assegnati: 5, positivi: 3, negativi: 1, nonLavorati: 1, valore: 300 }],
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

  it('include i fogli personale (esiti + sabati) e SAL per giorno', async () => {
    const buf = await buildWorkbookProduzione(dati);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const pe = wb.getWorksheet('Dati - personale');
    expect(pe).toBeDefined();
    expect(pe!.getCell('A1').value).toBe('Operatore');
    expect(pe!.getCell('F1').value).toBe('Assegnati');
    expect(pe!.getCell('A2').value).toBe('ROSSI');
    expect(pe!.getCell('B2').value).toBe(1.5); // giornate feriali
    expect(pe!.getCell('E2').value).toBe(166.67); // resa feriale €/gg
    expect(pe!.getCell('F2').value).toBe(5); // assegnati
    expect(pe!.getCell('G2').value).toBe(3); // positivi
    expect(pe!.getCell('H2').value).toBe(1); // negativi
    expect(pe!.getCell('I2').value).toBe(1); // non lavorati
    expect(pe!.getCell('A3').value).toBe('Sabati (attivazioni)');
    expect(pe!.getCell('B3').value).toBe(0.5);
    expect(pe!.getCell('D3').value).toBe(50);
    expect(pe!.getCell('A4').value).toBe('TOTALE (feriali)');
    expect(pe!.getCell('D4').value).toBe(250); // valoreFeriale
    const sg = wb.getWorksheet('Dati - SAL giorni');
    expect(sg).toBeDefined();
    expect(sg!.getCell('A2').value).toBe('2026-06-01');
    expect(sg!.getCell('C2').value).toBe(200);
  });
});
