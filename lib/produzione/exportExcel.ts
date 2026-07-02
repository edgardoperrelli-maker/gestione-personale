import 'server-only';
import ExcelJS from 'exceljs';
import type { ProduzioneEconomica } from './load';

// Genera il workbook "Produzione economica ACEA" da presentare alla proprietà:
// foglio Dashboard (titolo + KPI + Produzione vs SAL per voce) + fogli Dati (per voce/operatore/
// territorio/giorno + audit). Stile coerente col blu navy degli altri export (FF0F2749).
//
// NB: questa via ExcelJS è SEMPRE apribile (niente grafici nativi). Se in futuro si vuole il
// template con grafici Excel veri, basterà aggiungere public/templates/Produzione-Economica-Dashboard.xlsx
// con un foglio "Dati - per voce" (stesse colonne) e iniettarvi i dati via jszip preservando i grafici.

const NAVY = 'FF0F2749';
const WHITE = 'FFFFFFFF';
const EUR = '#,##0.00\\ "€"';

const KPI_LABEL: Record<string, string> = {
  EL: 'EL — Limitazioni',
  ES: 'ES — Sospensioni',
  ERC: 'ERC — Rimozione contatori',
  ERA: 'ERA — Rimozione abusi',
  NON_RISOLTA: 'Voce non risolta',
};

const AUDIT_LABEL: Record<string, string> = {
  SOLO_PORTALE: 'Solo nel portale (assente da DB e master)',
  DB_NON_IN_MASTER: 'Nel DB ma non nel master',
  MASTER_NON_IN_DB: 'Nel master ma non nel DB',
  POSITIVO_DB_NON_COMPLETATO_PORTALE: 'Positivo DB non consuntivato (Produzione > SAL)',
  COMPLETATO_PORTALE_NON_POSITIVO_DB: 'Consuntivato portale non positivo nel DB',
  VOCE_DISCORDE: 'Voce DB ≠ voce master',
  VOCE_NON_RISOLTA: 'Voce non derivabile dall’attività',
};

function intestazione(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  row.height = 18;
}

export async function buildWorkbookProduzione(dati: ProduzioneEconomica): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestione Personale';
  wb.created = new Date();

  // ── DASHBOARD ───────────────────────────────────────────────
  const dash = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] });
  dash.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  dash.mergeCells('A1:E1');
  const t = dash.getCell('A1');
  t.value = 'Produzione economica — ACEA';
  t.font = { bold: true, size: 16, color: { argb: NAVY } };
  dash.mergeCells('A2:E2');
  const sub = dash.getCell('A2');
  sub.value = `Periodo ${dati.from} → ${dati.to}`;
  sub.font = { size: 10, color: { argb: 'FF64748B' } };
  dash.addRow([]);

  // KPI cards (4 riquadri valore + etichetta)
  const kpi: Array<[string, number, boolean]> = [
    ['Produzione', dati.produzione.totale.valore, true],
    ['SAL (consuntivato portale)', dati.sal.totale.valore, true],
    ['Scarto Produzione − SAL', dati.scarto.valore, true],
    ['Ordini prodotti', dati.produzione.totale.conteggio, false],
  ];
  const labelRow = dash.addRow(kpi.map((k) => k[0]));
  labelRow.eachCell((c) => {
    c.font = { size: 9, color: { argb: 'FF64748B' } };
    c.alignment = { horizontal: 'left' };
  });
  const valRow = dash.addRow(kpi.map((k) => k[1]));
  valRow.eachCell((c, col) => {
    c.font = { bold: true, size: 14, color: { argb: NAVY } };
    if (kpi[col - 1]?.[2]) c.numFmt = EUR;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });
  valRow.height = 24;
  dash.addRow([]);

  // Produzione vs SAL per voce
  const r1 = dash.addRow(['Produzione vs SAL per voce']);
  r1.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
  intestazione(dash.addRow(['Voce', 'Ordini', 'Produzione €', 'SAL €']));
  for (const v of dati.produzione.perVoce) {
    const sal = dati.sal.perVoce.find((s) => s.chiave === v.chiave);
    const r = dash.addRow([KPI_LABEL[v.chiave] ?? v.chiave, v.conteggio, v.valore, sal?.valore ?? 0]);
    r.getCell(3).numFmt = EUR;
    r.getCell(4).numFmt = EUR;
  }
  // riga totale
  const tot = dash.addRow(['TOTALE', dati.produzione.totale.conteggio, dati.produzione.totale.valore, dati.sal.totale.valore]);
  tot.eachCell((c, col) => {
    c.font = { bold: true };
    if (col >= 3) c.numFmt = EUR;
  });

  // Riepilogo audit
  dash.addRow([]);
  const ra = dash.addRow(['Audit a tre vie (DB · master · portale)']);
  ra.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
  intestazione(dash.addRow(['Discrepanza', 'Conteggio']));
  for (const [classe, n] of Object.entries(dati.auditSummary)) {
    if (n > 0) dash.addRow([AUDIT_LABEL[classe] ?? classe, n]);
  }
  dash.addRow(['Voci non risolte (produzione)', dati.produzione.nonRisolte]);

  // ── DATI: per voce ──────────────────────────────────────────
  const dv = wb.addWorksheet('Dati - per voce');
  dv.columns = [{ width: 28 }, { width: 12 }, { width: 16 }, { width: 16 }];
  intestazione(dv.addRow(['Voce', 'Ordini', 'Produzione €', 'SAL €']));
  for (const v of dati.produzione.perVoce) {
    const sal = dati.sal.perVoce.find((s) => s.chiave === v.chiave);
    const r = dv.addRow([KPI_LABEL[v.chiave] ?? v.chiave, v.conteggio, v.valore, sal?.valore ?? 0]);
    r.getCell(3).numFmt = EUR;
    r.getCell(4).numFmt = EUR;
  }

  // ── DATI: operatori / territori / giorni ────────────────────
  const aggSheet = (nome: string, righe: { label: string; conteggio: number; valore: number }[]) => {
    const ws = wb.addWorksheet(nome);
    ws.columns = [{ width: 32 }, { width: 12 }, { width: 16 }];
    intestazione(ws.addRow([nome.replace('Dati - ', ''), 'Ordini', 'Produzione €']));
    for (const r of righe) {
      const row = ws.addRow([r.label, r.conteggio, r.valore]);
      row.getCell(3).numFmt = EUR;
    }
  };
  aggSheet('Dati - attività', dati.produzione.perAttivita);
  aggSheet('Dati - operatori', dati.produzione.perOperatore);
  aggSheet('Dati - territori', dati.produzione.perTerritorio);
  aggSheet(
    'Dati - giorni',
    dati.produzione.perGiorno.map((g) => ({ label: g.chiave, conteggio: g.conteggio, valore: g.valore })),
  );

  // ── DATI: personale (giornate-uomo frazionarie) ─────────────
  const pe = wb.addWorksheet('Dati - personale');
  pe.columns = [{ width: 32 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 }];
  intestazione(pe.addRow(['Operatore', 'Giornate', 'Interventi ACEA', 'Produzione €', 'Resa €/gg']));
  for (const o of dati.personale.perOperatore) {
    const r = pe.addRow([o.label, o.giornate, o.interventiAcea, o.valore, o.resa ?? '']);
    r.getCell(4).numFmt = EUR;
    if (o.resa != null) r.getCell(5).numFmt = EUR;
  }
  const peTot = pe.addRow(['TOTALE', dati.personale.totaleGiornate, '', dati.produzione.totale.valore, '']);
  peTot.eachCell((c, col) => {
    c.font = { bold: true };
    if (col === 4) c.numFmt = EUR;
  });

  // ── DATI: SAL per giorno ────────────────────────────────────
  const sg = wb.addWorksheet('Dati - SAL giorni');
  sg.columns = [{ width: 16 }, { width: 10 }, { width: 16 }];
  intestazione(sg.addRow(['Giorno', 'ODL', 'SAL €']));
  for (const g of dati.sal.perGiorno) {
    const r = sg.addRow([g.chiave, g.conteggio, g.valore]);
    r.getCell(3).numFmt = EUR;
  }

  // ── DATI: audit ─────────────────────────────────────────────
  const au = wb.addWorksheet('Dati - audit');
  au.columns = [{ width: 22 }, { width: 48 }];
  intestazione(au.addRow(['ODL', 'Discrepanza']));
  for (const d of dati.audit) au.addRow([d.odl, AUDIT_LABEL[d.classe] ?? d.classe]);
  if (dati.auditTruncated) au.addRow([`… elenco troncato (${dati.audit.length}/${dati.auditTotale})`, '']);

  return wb.xlsx.writeBuffer();
}
