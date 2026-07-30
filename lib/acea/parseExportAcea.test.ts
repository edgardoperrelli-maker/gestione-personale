import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { parseExportAcea, normalizzaMatricola, type EsitoParse } from './parseExportAcea';
import type { RigaOrdineAcea } from './tipi';

// La fixture è un campione ANONIMIZZATO dell'export reale (42 righe, 29 casi limite).
// Rigenerabile con: node scripts/genera-fixture-acea.mjs <export-reale.xlsx>
const FIXTURE = path.join(process.cwd(), 'docs/fixtures/acea/export-campione.xlsx');

let esito: EsitoParse;
let righe: RigaOrdineAcea[];
const trova = (odl: string, op?: string): RigaOrdineAcea => {
  const r = righe.find((x) => x.odl === odl && (op === undefined || x.numero_operazione === op));
  if (!r) throw new Error(`riga ${odl}/${op ?? '*'} non trovata nella fixture`);
  return r;
};

beforeAll(async () => {
  esito = await parseExportAcea(fs.readFileSync(FIXTURE));
  if (!esito.ok) throw new Error(`parse fallito: ${esito.motivo}`);
  righe = esito.righe;
});

describe('parseExportAcea — lettura della fixture', () => {
  it('legge tutte le righe senza scartarne nessuna', () => {
    expect(esito.ok).toBe(true);
    expect(righe.length).toBe(42);
  });

  it('la chiave è (odl, numero_operazione): un ordine con due operazioni dà due righe', () => {
    const doppie = righe.filter((r) => r.odl === '956868342');
    expect(doppie).toHaveLength(2);
    expect(doppie.map((r) => r.numero_operazione).sort()).toEqual(['0040', '0050']);
    // ogni operazione porta il proprio valore: contarne una sola perderebbe 163,48 €
    expect(doppie.every((r) => r.valore_netto === 163.48)).toBe(true);
    // le chiavi composte sono tutte distinte
    const chiavi = righe.map((r) => `${r.odl}|${r.numero_operazione}`);
    expect(new Set(chiavi).size).toBe(righe.length);
  });

  it('riporta la finestra coperta dal file', () => {
    expect(esito.ok && esito.finestra.dal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(esito.ok && esito.finestra.al).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(esito.ok && (esito.finestra.dal ?? '') <= (esito.finestra.al ?? '')).toBe(true);
  });

  it('converte le date in ISO senza slittamenti di fuso', () => {
    for (const r of righe) {
      expect(r.data_creazione).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (r.cardine_al) expect(r.cardine_al).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('parseExportAcea — classificazione', () => {
  it('separa dunning e massive da "Tipo di ordine"', () => {
    expect(trova('912215286').famiglia).toBe('massive');          // ASTR
    expect(trova('957276160').famiglia).toBe('dunning');          // ALIM
    expect(trova('957276082').famiglia).toBe('dunning');          // AMOR
    expect(trova('957309729').famiglia).toBe('dunning');          // ARMO
    expect(trova('956868342', '0040').famiglia).toBe('dunning');  // AVUF: verifiche da ufficio
  });

  it('le saracinesche sono massive (ASTR) nonostante l\'attività diversa', () => {
    const s = trova('912353785');
    expect(s.famiglia).toBe('massive');
    expect(s.attivita).toBe('Sostituzione saracinesca o valvola');
    expect(s.valore_netto).toBe(91.12);
  });

  it('marca aperti anche i SOSP', () => {
    expect(trova('912230421').aperto).toBe(true);   // SOSP
    expect(trova('912215130').aperto).toBe(true);   // RICE
    expect(trova('957371331').aperto).toBe(true);   // ASGN
    expect(trova('912215286').aperto).toBe(true);   // DAPI
    expect(trova('957276160').aperto).toBe(false);  // COMP
    expect(trova('957276437').aperto).toBe(false);  // ANNL
  });

  it('gli annullati vengono letti, non scartati (li rimuove la riconciliazione)', () => {
    expect(trova('957276437').stato).toBe('ANNL');
  });
});

describe('parseExportAcea — misuratore', () => {
  it('usa la colonna quando c\'è', () => {
    const r = trova('957276160');
    expect(r.matricola).toBe('201915053400');
    expect(r.impianto).toBe('4000488324');
    expect(r.origine_misuratore).toBe('colonna');
  });

  it('lo ricava dal testo dell\'ordine sulle massive, dove la colonna è vuota', () => {
    const r = trova('912215286');
    expect(r.origine_misuratore).toBe('testo');
    expect(r.impianto).toMatch(/^\d{10}$/);
    expect(r.matricola).toBeTruthy();
  });

  it('lo ricava dal testo anche sulle saracinesche', () => {
    const r = trova('912353785');
    expect(r.origine_misuratore).toBe('testo');
    expect(r.impianto).toMatch(/^\d{10}$/);
  });

  it('normalizza la matricola per gli aggancî', () => {
    expect(normalizzaMatricola('04-228458')).toBe('04228458');
    expect(normalizzaMatricola('MIS-E392-3017')).toBe('MISE3923017');
    expect(normalizzaMatricola('  123324a ')).toBe('123324A');
    expect(normalizzaMatricola(null)).toBeNull();
    expect(normalizzaMatricola('---')).toBeNull();
  });

  it('regge la matricola a 16 caratteri senza troncarla', () => {
    expect(trova('957275921').matricola).toBe('WTTS075224001826');
  });

  it('copre tutte le righe tranne le rimozioni abusive senza impianto', () => {
    const senza = righe.filter((r) => !r.impianto && !r.matricola);
    expect(senza.every((r) => r.attivita === 'Rimozione impianto abusivo')).toBe(true);
    expect(righe.length - senza.length).toBeGreaterThanOrEqual(38);
  });
});

describe('parseExportAcea — scadenze', () => {
  it('le massive non scadono mai, anche con il cardine valorizzato', () => {
    const m = trova('912215286');
    expect(m.cardine_al).toBeTruthy();
    expect(m.scadenza).toBeNull();
  });

  it('le attivazioni RIAT/REVO scadono il giorno dopo la creazione', () => {
    for (const odl of ['957312252', '957309729']) {
      const r = trova(odl);
      expect(['RIAT', 'REVO']).toContain(r.codice_sla);
      expect(r.scadenza).toBe(
        new Date(Date.parse(`${r.data_creazione}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
      );
    }
  });

  it('il resto del dunning scade a 14 giorni', () => {
    const r = trova('957276160');
    expect(r.codice_sla).toBe('NSLA');
    expect(r.scadenza).toBe(
      new Date(Date.parse(`${r.data_creazione}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10),
    );
  });
});

describe('parseExportAcea — consuntivazione ed esiti', () => {
  it('marca le revoche escluse dalla consuntivazione', () => {
    // Figlie di un OdM padre: il valore lo porta il padre, contarle sarebbe doppio conteggio.
    const r = trova('957309729');
    expect(r.escludi_consuntivazione).toBe(true);
    expect(r.odm_riferimento).toBeTruthy();
  });

  it('le altre righe non sono escluse', () => {
    expect(trova('957276160').escludi_consuntivazione).toBe(false);
  });

  it('traduce l\'icona della causale in esito', () => {
    const conEsito = righe.filter((r) => r.esito_positivo !== null);
    expect(conEsito.length).toBeGreaterThan(0);
    for (const r of conEsito) expect(typeof r.esito_positivo).toBe('boolean');
    // una riga non ancora esitata non ha esito
    expect(trova('912215286').esito_positivo).toBeNull();
  });
});

describe('parseExportAcea — avvisi non bloccanti', () => {
  it('segnala i misuratori non ricavabili senza scartare la riga', () => {
    const assenti = esito.ok ? esito.avvisi.filter((a) => a.tipo === 'misuratore_assente') : [];
    expect(assenti.length).toBeGreaterThan(0);
    for (const a of assenti) expect(trova(a.odl, a.numero_operazione)).toBeTruthy();
  });

  it('non produce avvisi di tipo ignoto sulla fixture (tutti i tipi sono noti)', () => {
    const ignoti = esito.ok ? esito.avvisi.filter((a) => a.tipo === 'tipo_ordine_ignoto') : [];
    expect(ignoti).toHaveLength(0);
  });

  it('segnala il caso reale al limite dei 40 caratteri', () => {
    // "4000150441_Sost_Sarac_ser_25-20291502786": 40 caratteri esatti, matricola a fine stringa.
    // È l'unica riga dell'export reale (1 su 5.293) in cui non si può escludere un troncamento:
    // il guardrail la segnala per il controllo a mano invece di far finta di niente.
    const r = trova('912353785');
    expect(r.testo_ordine).toHaveLength(40);
    expect(r.sospetto_troncamento).toBe(true);
    const avviso = esito.ok
      ? esito.avvisi.find((a) => a.odl === '912353785' && a.tipo === 'sospetto_troncamento')
      : undefined;
    expect(avviso).toBeTruthy();
  });

  it('le righe senza misuratore sono solo rimozioni allacci abusivi', () => {
    // Confermato sull'export reale: 6 righe su 5.293, tutte "Rimozione impianto abusivo",
    // dove la matricola non serve e spesso non esiste ("SCISSIONE_ODL_PADRE", "RICERCA FRODE…").
    const assenti = esito.ok ? esito.avvisi.filter((a) => a.tipo === 'misuratore_assente') : [];
    for (const a of assenti) {
      expect(trova(a.odl, a.numero_operazione).attivita).toBe('Rimozione impianto abusivo');
    }
  });
});

describe('parseExportAcea — hash e idempotenza', () => {
  it('assegna a ogni riga un hash valido e stabile fra due letture', async () => {
    for (const r of righe) expect(r.riga_hash).toMatch(/^[0-9a-f]{64}$/);
    const secondo = await parseExportAcea(fs.readFileSync(FIXTURE));
    expect(secondo.ok).toBe(true);
    if (!secondo.ok) return;
    const per = new Map(secondo.righe.map((r) => [`${r.odl}|${r.numero_operazione}`, r.riga_hash]));
    for (const r of righe) expect(per.get(`${r.odl}|${r.numero_operazione}`)).toBe(r.riga_hash);
  });
});

describe('parseExportAcea — validazione del file', () => {
  async function workbookCon(header: string[], riga: unknown[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Esportazione SAPUI5');
    ws.addRow(header);
    ws.addRow(riga);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('rifiuta un file senza le colonne obbligatorie', async () => {
    const buf = await workbookCon(['Data', 'Operatore', 'Note'], ['2026-07-01', 'X', 'Y']);
    const e = await parseExportAcea(buf);
    expect(e.ok).toBe(false);
    if (!e.ok) {
      expect(e.motivo).toMatch(/colonne mancanti/i);
      expect(e.dettagli).toContain('Ordine');
    }
  });

  it('rifiuta l\'export di un\'altra commessa', async () => {
    const header = ['Ordine', 'Numero Operazione', 'Stato Operazione', 'Tipo di ordine',
      'Operazione testo breve', 'Data documento', 'Contratto', 'Fornitore'];
    const buf = await workbookCon(header,
      ['999', '0010', 'DAPI', 'ALIM', 'Limitazione flusso idrico', '2026-07-01', '9999999999', '25617']);
    const e = await parseExportAcea(buf);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toMatch(/altro contratto/i);
  });

  it('rifiuta un file senza righe valide', async () => {
    const header = ['Ordine', 'Numero Operazione', 'Stato Operazione', 'Tipo di ordine',
      'Operazione testo breve', 'Data documento', 'Contratto', 'Fornitore'];
    const buf = await workbookCon(header, []);
    const e = await parseExportAcea(buf);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toMatch(/nessuna riga|non contiene righe/i);
  });

  it('rifiuta un file che non è un Excel', async () => {
    const e = await parseExportAcea(Buffer.from('non sono un xlsx'));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toMatch(/non leggibile/i);
  });
});

/*
  Ogni avviso deve poter essere RAGGIUNTO, non solo contato.

  Il riquadro dell'import diceva «13 righe da controllare» e si fermava lì: nessun elenco, nessun
  modo di arrivarci. Un numero così si legge, si annuisce, e le righe restano dove sono.
  Ora ogni avviso porta l'ODL e la famiglia, e diventa un link al registro giusto — senza
  `famiglia` quel link non saprebbe dove mandare, visto che le due viste sono separate.
*/
describe('gli avvisi si possono raggiungere', () => {
  const HEADER = ['Ordine', 'Numero Operazione', 'Stato Operazione', 'Tipo di ordine',
    'Operazione testo breve', 'Data documento', 'Contratto', 'Fornitore', 'Testo breve Ordine'];

  async function conRighe(righe: unknown[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Esportazione SAPUI5');
    ws.addRow(HEADER);
    for (const r of righe) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('un avviso porta l’ODL e il registro in cui cercarlo', async () => {
    // Riga senza impianto né matricola: fa scattare `misuratore_assente`.
    const buf = await conRighe([
      ['957000001', '0190', 'DAPI', 'ALIM', 'Limitazione flusso idrico', '2026-07-01', '3600002158', '25617', ''],
    ]);
    const e = await parseExportAcea(buf);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.avvisi.length).toBeGreaterThan(0);
    for (const a of e.avvisi) {
      expect(a.odl).toBe('957000001');
      expect(['dunning', 'massive']).toContain(a.famiglia);
    }
  });

  it('la famiglia dell’avviso e` quella della riga a cui si riferisce', async () => {
    const buf = await conRighe([
      ['957000001', '0190', 'DAPI', 'ALIM', 'Limitazione flusso idrico', '2026-07-01', '3600002158', '25617', ''],
      ['912000002', '0010', 'DAPI', 'ASTR', 'Limitazione Massiva su Impianto', '2026-07-01', '3600002158', '25617', ''],
    ]);
    const e = await parseExportAcea(buf);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const perChiave = new Map(e.righe.map((r) => [`${r.odl}|${r.numero_operazione}`, r.famiglia]));
    for (const a of e.avvisi) {
      const attesa = perChiave.get(`${a.odl}|${a.numero_operazione}`);
      // Un link che manda sull'altro registro non trova niente, e sembra un avviso su una riga
      // che non esiste.
      if (attesa) expect(a.famiglia).toBe(attesa);
    }
  });
});
