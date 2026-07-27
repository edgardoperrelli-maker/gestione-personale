import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { MASTER_MASSIVE, type RigaMaster } from './fogliExport';
import { intestazioniXlsx, scriviFoglio } from './scriviFoglio';

const riga = (over: Partial<RigaMaster> = {}): RigaMaster => ({
  odl: '912215286', numero_operazione: '0010', impianto: '4000308907',
  matricola: '202415647231', indirizzo: 'VIA ALFA 1', via: 'VIA ALFA', civico: '1',
  cap: '00030', comune: 'LABICO', lat: 41.79, lng: 12.88,
  attivita: 'Limitazione Massiva su Impianto', stato: 'COMP', esecutore: 'ROSSI',
  data_prevista: '2026-07-27', esito: 'eseguito', saracinesca: 'SI', sigillo: 'AA728566',
  note: '', odl_saracinesca: '4100000001', automazione: true, ...over,
});

/** Riapre il file appena scritto: è l'unica prova che valga per una via d'uscita. */
async function riapri(wb: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  const buf = await wb.xlsx.writeBuffer();
  const letto = new ExcelJS.Workbook();
  await letto.xlsx.load(buf as ArrayBuffer);
  return letto.worksheets[0];
}

describe('scriviFoglio', () => {
  it('il file si riapre e il foglio ha il nome del master', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, [riga()]));
    expect(ws.name).toBe('Foglio1');
    expect(ws.rowCount).toBe(2); // intestazione + una riga
  });

  it('le intestazioni sopravvivono al giro, nell ordine del master', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, [riga()]));
    const lette: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c) => lette.push(String(c.value ?? '')));
    expect(lette).toEqual(MASTER_MASSIVE.campi.map((c) => c.intestazione));
  });

  it('la data resta una data vera, non un numero né del testo', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, [riga()]));
    const col = MASTER_MASSIVE.campi.findIndex((c) => c.intestazione === 'data prevista') + 1;
    const cella = ws.getRow(2).getCell(col);
    expect(cella.value).toBeInstanceOf(Date);
    expect((cella.value as Date).getDate()).toBe(27);
    // Senza formato Excel mostrerebbe il seriale (46_000 e rotti) invece del giorno.
    expect(cella.numFmt).toBe('dd/mm/yyyy');
  });

  it('i numeri restano numeri: Long e Lat si possono ancora usare in una formula', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, [riga()]));
    const col = (nome: string) => MASTER_MASSIVE.campi.findIndex((c) => c.intestazione === nome) + 1;
    expect(ws.getRow(2).getCell(col('Lat')).value).toBe(41.79);
    expect(ws.getRow(2).getCell(col('Long')).value).toBe(12.88);
  });

  it('l ODL resta testo: gli zeri iniziali non si perdono', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, [riga({ odl: '0912215286' })]));
    expect(ws.getRow(2).getCell(1).value).toBe('0912215286');
  });

  it('intestazione bloccata e filtro automatico: un master di duemila righe si legge', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, [riga()]));
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it('senza righe resta un file valido con la sola intestazione', async () => {
    const ws = await riapri(scriviFoglio('Foglio1', MASTER_MASSIVE.campi, []));
    expect(ws.rowCount).toBe(1);
  });
});

describe('intestazioniXlsx', () => {
  it('dichiara il tipo xlsx e il nome del file da salvare', () => {
    const h = intestazioniXlsx('master-LABICO-20260727.xlsx', 4096);
    expect(h['Content-Disposition']).toBe('attachment; filename="master-LABICO-20260727.xlsx"');
    expect(h['Content-Type']).toContain('spreadsheetml.sheet');
    expect(h['Content-Length']).toBe('4096');
  });
});
