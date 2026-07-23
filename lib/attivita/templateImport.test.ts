import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTemplateImport, COLONNE_TEMPLATE } from './templateImport';
import { isHeaderTemplateUfficiale } from './templateColonne';
import type { TassonomiaRiga } from './tassonomia';

const TASSONOMIA: TassonomiaRiga[] = [
  { committente: 'acea', descrizione: 'Limitazione Massiva su Impianto', descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'italgas', descrizione: 'BONIFICHE', descrizioneNorm: 'BONIFICHE', gruppo: 'BONIFICHE', attivo: true },
  { committente: 'italgas', descrizione: 'RITIRATA', descrizioneNorm: 'RITIRATA', gruppo: 'X', attivo: false },
];

async function carica(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('buildTemplateImport', () => {
  it('due fogli: Interventi e Leggenda', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Interventi', 'Leggenda']);
  });
  it('header del foglio Interventi = COLONNE_TEMPLATE', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Interventi')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header).toEqual([...COLONNE_TEMPLATE]);
  });
  it('INVARIANTE: il file generato è riconosciuto come template ufficiale dal gate di import', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Interventi')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1);
    expect(isHeaderTemplateUfficiale(header)).toBe(true);
  });
  it('la colonna GRUPPO ha la formula di lookup sulla Leggenda', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    const idxGruppo = COLONNE_TEMPLATE.indexOf("GRUPPO ATTIVITA'") + 1;
    const cell = ws.getRow(2).getCell(idxGruppo);
    expect(String((cell.value as { formula?: string })?.formula ?? '')).toContain('VLOOKUP');
  });
  it('la colonna COMMITTENTE si popola da sola (VLOOKUP colonna 4 della Leggenda)', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    const idxCommittente = COLONNE_TEMPLATE.indexOf('COMMITTENTE') + 1;
    const formula = String((ws.getRow(2).getCell(idxCommittente).value as { formula?: string })?.formula ?? '');
    expect(formula).toContain('VLOOKUP');
    expect(formula).toContain(',4,FALSE');
  });
  it('ROBUSTEZZA: GRUPPO/COMMITTENTE si auto-localizzano (INDIRECT+ROW), formula IDENTICA su ogni riga', async () => {
    // Regressione: un riferimento relativo (es. G2) si sfasa se l'utente riusa il file
    // svuotandolo e re-incollando i dati in Excel → l'autocompilazione si rompe. Con
    // INDIRECT("G"&ROW()) la formula è identica su tutte le righe e punta sempre alla
    // DESCRIZIONE della propria riga fisica.
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 10));
    const ws = wb.getWorksheet('Interventi')!;
    const formula = (r: number, col: string) =>
      String((ws.getRow(r).getCell(COLONNE_TEMPLATE.indexOf(col as (typeof COLONNE_TEMPLATE)[number]) + 1).value as { formula?: string })?.formula ?? '');
    for (const col of ["GRUPPO ATTIVITA'", 'COMMITTENTE'] as const) {
      const f2 = formula(2, col);
      // Self-locating: usa INDIRECT + ROW(), niente riferimento di riga hardcoded.
      expect(f2).toContain('INDIRECT(');
      expect(f2).toContain('ROW()');
      expect(f2).not.toMatch(/TRIM\(G\d+\)/); // niente G2/G3/... cablato
      // Identica su righe lontane → immune alla posizione.
      expect(formula(6, col)).toBe(f2);
      expect(formula(11, col)).toBe(f2);
    }
  });
  it('foglio protetto: GRUPPO e COMMITTENTE bloccati, il resto (COMUNE/territorio incluso) libero', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    // La protezione del foglio è attiva (senza password: solo anti-errore).
    expect((ws as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet).toBe(true);
    const riga = ws.getRow(2);
    const locked = (nome: (typeof COLONNE_TEMPLATE)[number]) =>
      riga.getCell(COLONNE_TEMPLATE.indexOf(nome) + 1).protection?.locked !== false;
    expect(locked("GRUPPO ATTIVITA'")).toBe(true);
    expect(locked('COMMITTENTE')).toBe(true);
    for (const libera of ['CO', 'COMUNE', 'DESCRIZIONE ATTIVITÀ', 'Indirizzo', 'Esecutore'] as const) {
      expect(locked(libera)).toBe(false);
    }
  });
  it('la colonna DESCRIZIONE ATTIVITÀ ha la tendina (aiuto) ma NON blocca il codice per intero', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    const idxDescr = COLONNE_TEMPLATE.indexOf('DESCRIZIONE ATTIVITÀ') + 1;
    for (const r of [2, 6]) {
      const dv = ws.getRow(r).getCell(idxDescr).dataValidation;
      expect(dv?.type).toBe('list');
      // Non blocca: permette di incollare il codice attività PER INTERO (gate = validaImport server).
      expect(dv?.showErrorMessage).toBeFalsy();
      // 2 attive in TASSONOMIA → elenco B2:B3 della Leggenda.
      expect(String(dv?.formulae?.[0] ?? '')).toBe('Leggenda!$B$2:$B$3');
    }
  });

  it('la Leggenda contiene solo righe attive, con chiave upper in colonna A', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Leggenda')!;
    const valori: string[] = [];
    for (let r = 2; r <= ws.rowCount; r++) valori.push(String(ws.getRow(r).getCell(2).value ?? ''));
    expect(valori).toContain('Limitazione Massiva su Impianto');
    expect(valori).toContain('BONIFICHE');
    expect(valori).not.toContain('RITIRATA');
    expect(String(ws.getRow(2).getCell(1).value)).toBe(String(ws.getRow(2).getCell(2).value).toUpperCase());
  });
});
