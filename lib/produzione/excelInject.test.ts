import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { iniettaCelle, iniettaTemplate, mappaCelleProduzione } from './excelInject';

type Dati = Parameters<typeof mappaCelleProduzione>[0];

const mockDati = {
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
  audit: [{ odl: 'o1', classe: 'DB_NON_IN_MASTER' }],
  auditSummary: {} as Record<string, number>,
  auditTotale: 1,
  auditTruncated: false,
  masterPopolato: true,
  portalePopolato: true,
} as unknown as Dati;

describe('iniettaCelle', () => {
  const xml =
    '<row r="2"><c r="B2" t="n"><v>0</v></c><c r="C2" s="8" t="n"><v>0</v></c>' +
    '<c r="A2" s="7" t="inlineStr"><is><t>EL</t></is></c></row>';

  it('sostituisce numeri e testo preservando lo stile; salta le celle mancanti; escapa XML', () => {
    const out = iniettaCelle(xml, { B2: 5, C2: 12.5, A2: 'R&D <x>', Z9: 99 });
    expect(out).toContain('<c r="B2" t="n"><v>5</v></c>');
    expect(out).toContain('<c r="C2" s="8" t="n"><v>12.5</v></c>');
    expect(out).toContain('<c r="A2" s="7" t="inlineStr"><is><t xml:space="preserve">R&amp;D &lt;x&gt;</t></is></c>');
    expect(out).not.toContain('Z9');
  });
});

describe('mappaCelleProduzione', () => {
  it('mappa voci, periodo, dettaglio e audit sulle celle attese', () => {
    const c = mappaCelleProduzione(mockDati);
    expect(c.Dati.B9).toBe('2026-06-01');
    expect(c.Dati.B10).toBe('2026-06-30');
    expect(c.Dati.B2).toBe(2); // EL ordini
    expect(c.Dati.C2).toBe(200); // EL produzione
    expect(c.Dati.D2).toBe(200); // EL sal
    expect(c.Dati.C3).toBe(100); // ES produzione
    expect(c.Dati.D3).toBe(0); // ES sal (assente)
    expect(c.Dettaglio.A2).toBe('ROSSI');
    expect(c.Dettaglio.C2).toBe(300);
    expect(c.Audit.A2).toBe('o1');
    expect(c.Audit.B2).toContain('non nel master');
  });
});

describe('iniettaTemplate (integrazione sul template reale)', () => {
  it('inietta i dati e PRESERVA i grafici nativi', async () => {
    const tpl = fs.readFileSync(path.join(process.cwd(), 'public', 'templates', 'Produzione-Economica-Dashboard.xlsx'));
    const buf = await iniettaTemplate(tpl, mappaCelleProduzione(mockDati));

    // grafici preservati (ExcelJS non sa LEGGERE i grafici → verifico l'XML dal zip)
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('xl/charts/chart1.xml')).not.toBeNull();
    expect(zip.file('xl/charts/chart2.xml')).not.toBeNull();

    // valori iniettati nel foglio Dati (sheet2)
    const datiXml = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(datiXml).toContain('<c r="C2" s="8" t="n"><v>200</v></c>'); // EL produzione
    expect(datiXml).toContain('<c r="B2" t="n"><v>2</v></c>'); // EL ordini
    expect(datiXml).toContain('2026-06-01'); // periodo B9
  });
});
