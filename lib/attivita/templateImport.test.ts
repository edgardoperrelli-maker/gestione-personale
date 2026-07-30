import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTemplateImport, COLONNE_TEMPLATE, FOGLIO_MASTER_ODL } from './templateImport';
import { isHeaderTemplateUfficiale } from './templateColonne';
import type { TassonomiaRiga } from './tassonomia';
import type { RigaMasterOdl } from './masterOdl';

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

  const MASTER: RigaMasterOdl[] = [
    { odl: '912000001', descrizione: 'Limitazione Massiva su Impianto', matricola: 'M1', indirizzo: 'VIA ROMA 1', comune: 'LABICO' },
    { odl: '912000002', descrizione: '', matricola: 'M2', indirizzo: '', comune: 'RIANO' },
  ];
  const COL_ODL = COLONNE_TEMPLATE.indexOf('ODS/ODL') + 1; // D
  const cella = (ws: ExcelJS.Worksheet, r: number, nome: (typeof COLONNE_TEMPLATE)[number]) =>
    ws.getRow(r).getCell(COLONNE_TEMPLATE.indexOf(nome) + 1);

  it('senza master: nessun foglio MasterODL, MATRICOLA/Indirizzo/COMUNE senza formula', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    expect(wb.getWorksheet(FOGLIO_MASTER_ODL)).toBeUndefined();
    const ws = wb.getWorksheet('Interventi')!;
    for (const nome of ['MATRICOLA', 'Indirizzo', 'COMUNE'] as const) {
      expect(cella(ws, 2, nome).value ?? null).toBeNull();
    }
  });

  it("con master: terzo foglio MasterODL protetto, righe nell'ordine dato", async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5, MASTER));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Interventi', 'Leggenda', FOGLIO_MASTER_ODL]);
    const wm = wb.getWorksheet(FOGLIO_MASTER_ODL)!;
    expect((wm.getRow(1).values as unknown[]).slice(1)).toEqual(['ODL', 'DESCRIZIONE ATTIVITÀ', 'MATRICOLA', 'INDIRIZZO', 'COMUNE']);
    expect((wm.getRow(2).values as unknown[]).slice(1)).toEqual(['912000001', 'Limitazione Massiva su Impianto', 'M1', 'VIA ROMA 1', 'LABICO']);
    expect((wm as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet).toBe(true);
  });

  it('con master: MATRICOLA/Indirizzo/COMUNE/DESCRIZIONE si compilano dall\'ODL (VLOOKUP su MasterODL, self-locating, identico su ogni riga)', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 10, MASTER));
    const ws = wb.getWorksheet('Interventi')!;
    const attese: Array<[(typeof COLONNE_TEMPLATE)[number], number]> = [
      ['DESCRIZIONE ATTIVITÀ', 2], ['MATRICOLA', 3], ['Indirizzo', 4], ['COMUNE', 5],
    ];
    for (const [nome, n] of attese) {
      const f2 = String((cella(ws, 2, nome).value as { formula?: string })?.formula ?? '');
      expect(f2).toContain(`VLOOKUP`);
      expect(f2).toContain(`${FOGLIO_MASTER_ODL}!$A$2:$E$3,${n},FALSE`);
      // Self-locating (INDIRECT+ROW) e coercizione a testo dell'ODL digitato come numero.
      expect(f2).toContain('INDIRECT("D"&ROW())&""');
      // T(...) evita lo 0 dei buchi del master.
      expect(f2).toContain('T(VLOOKUP');
      expect(String((cella(ws, 11, nome).value as { formula?: string })?.formula ?? '')).toBe(f2);
    }
    // Le celle autocompilate restano LIBERE: per un ODL fuori master si scrive a mano.
    for (const [nome] of attese) {
      expect(cella(ws, 2, nome).protection?.locked).toBe(false);
    }
  });

  it('con master: ODL in formato testo e rosso condizionale sugli ODL sconosciuti', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5, MASTER));
    const ws = wb.getWorksheet('Interventi')!;
    expect(ws.getRow(2).getCell(COL_ODL).numFmt).toBe('@');
    const cf = (ws as unknown as { conditionalFormattings?: Array<{ ref: string; rules: Array<{ type: string; formulae?: string[] }> }> }).conditionalFormattings ?? [];
    const regola = cf.find((c) => c.ref === 'D2:D6')?.rules?.[0];
    expect(regola?.type).toBe('expression');
    expect(String(regola?.formulae?.[0] ?? '')).toContain('COUNTIF(MasterOdlChiavi');
    // Il defined name usato dalla regola esiste e punta alle chiavi del MasterODL.
    const nomi = (wb.model.definedNames as Array<{ name: string; ranges: string[] }> | undefined) ?? [];
    expect(nomi.find((n) => n.name === 'MasterOdlChiavi')?.ranges).toEqual([`${FOGLIO_MASTER_ODL}!$A$2:$A$3`]);
  });

  it('INVARIANTE: anche col master il file resta riconosciuto come template ufficiale', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5, MASTER));
    const header = (wb.getWorksheet('Interventi')!.getRow(1).values as unknown[]).slice(1);
    expect(isHeaderTemplateUfficiale(header)).toBe(true);
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
