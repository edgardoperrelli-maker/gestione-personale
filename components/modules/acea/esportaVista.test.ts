import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DefColonna, RigaTabella } from '@/lib/acea/colonneTabella';
import { serialeExcel } from '@/lib/acea/exportVista';
import { caricaTutteLeRighe, esportaVista } from './esportaVista';

type Chiamata = { pagina: string | null; perPagina: string | null; url: URL };

/**
 * Finto `/api/acea/ordini` con `n` righe totali, che pagina come il vero.
 *
 * `chiamate` registra ogni richiesta: la parte da sorvegliare non è solo *quante* righe tornano,
 * ma che l'export chieda le pagine giuste **con gli stessi filtri** della tabella.
 */
function finestraApi(n: number, chiamate: Chiamata[], rompiAllaPagina?: number) {
  return vi.fn(async (input: string) => {
    const url = new URL(input, 'http://x');
    const pagina = Number(url.searchParams.get('pagina') ?? '1');
    const perPagina = Number(url.searchParams.get('perPagina') ?? '500');
    chiamate.push({
      pagina: url.searchParams.get('pagina'),
      perPagina: url.searchParams.get('perPagina'),
      url,
    });
    if (pagina === rompiAllaPagina) {
      return { ok: false, json: async () => ({ error: 'Registro non disponibile.' }) };
    }
    const da = (pagina - 1) * perPagina;
    const quante = Math.max(0, Math.min(perPagina, n - da));
    return {
      ok: true,
      json: async () => ({
        righe: Array.from({ length: quante }, (_, i) => ({ odl: String(da + i) })),
      }),
    };
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('caricaTutteLeRighe', () => {
  it('scarica la vista INTERA, non la prima pagina', async () => {
    // Il difetto che questo test presidia: con la tabella a 300 righe su 5.293, «Esporta vista»
    // produceva un xlsx da 300 righe senza dirlo.
    const chiamate: Chiamata[] = [];
    vi.stubGlobal('fetch', finestraApi(5293, chiamate));

    const righe = await caricaTutteLeRighe('famiglia=dunning&perPagina=300', 5293);

    expect(righe).toHaveLength(5293);
    expect(chiamate).toHaveLength(11);
    expect(chiamate.map((c) => c.pagina)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('chiede pagine piene, ignorando il `perPagina` della tabella', async () => {
    const chiamate: Chiamata[] = [];
    vi.stubGlobal('fetch', finestraApi(1200, chiamate));

    await caricaTutteLeRighe('famiglia=massive&perPagina=300', 1200);

    // 300 è la finestra di lettura della tabella: riusarla qui vorrebbe dire quattro volte le
    // richieste per lo stesso foglio.
    expect(chiamate.every((c) => c.perPagina === '500')).toBe(true);
    expect(chiamate).toHaveLength(3);
  });

  it('porta con sé i filtri della vista, non solo la famiglia', async () => {
    const chiamate: Chiamata[] = [];
    vi.stubGlobal('fetch', finestraApi(10, chiamate));

    await caricaTutteLeRighe('famiglia=dunning&stato=aperti&comune=ROMA&comune=TIVOLI&via=NAZIONALE', 10);

    const p = chiamate[0].url.searchParams;
    expect(p.get('stato')).toBe('aperti');
    expect(p.getAll('comune')).toEqual(['ROMA', 'TIVOLI']); // i ripetuti restano ripetuti
    expect(p.get('via')).toBe('NAZIONALE');
  });

  it('un errore a metà risale invece di consegnare un foglio mozzato', async () => {
    const chiamate: Chiamata[] = [];
    vi.stubGlobal('fetch', finestraApi(5000, chiamate, 4));

    await expect(caricaTutteLeRighe('famiglia=dunning', 5000)).rejects.toThrow('Registro non disponibile.');
    // Si è fermato alla pagina rotta: nessun file con 1.500 righe al posto di 5.000.
    expect(chiamate).toHaveLength(4);
  });

  it('riferisce l’avanzamento a ogni pagina', async () => {
    vi.stubGlobal('fetch', finestraApi(1200, []));
    const passi: number[] = [];

    await caricaTutteLeRighe('famiglia=dunning', 1200, (n) => passi.push(n));

    expect(passi).toEqual([500, 1000, 1200]);
  });

  it('si ferma su una pagina vuota invece di ciclare a vuoto', async () => {
    // Il registro è cambiato sotto (un import in corso): il totale di partenza promette più righe
    // di quante ce ne siano.
    const chiamate: Chiamata[] = [];
    vi.stubGlobal('fetch', finestraApi(600, chiamate));

    const righe = await caricaTutteLeRighe('famiglia=dunning', 5000);

    expect(righe).toHaveLength(600);
    expect(chiamate).toHaveLength(3); // 500, 100, poi vuota e stop
  });

  it('senza righe non chiama nessuno', async () => {
    const fetchFinto = finestraApi(0, []);
    vi.stubGlobal('fetch', fetchFinto);

    expect(await caricaTutteLeRighe('famiglia=dunning', 0)).toEqual([]);
    expect(fetchFinto).not.toHaveBeenCalled();
  });
});

/*
  Il foglio che esce davvero, riletto.

  La parte che conta di `scriviXlsx` non si vede da nessuna parte se non dentro il file: che una
  data sia una DATA e non del testo che le somiglia si scopre solo aprendo l'xlsx e provando a
  ordinare la colonna — cioè quando il file è già stato mandato a qualcuno. Qui lo si scrive, lo si
  rilegge e glielo si chiede.

  `esportaVista` finisce con un `<a download>` cliccato: in ambiente node non c'è, quindi si
  intercetta il `Blob` e da lì si torna al foglio.
*/
function catturaFoglio(): () => Uint8Array {
  let scritto: ArrayBuffer | null = null;
  class BlobFinto {
    constructor(parti: ArrayBuffer[]) { scritto = parti[0]; }
  }
  vi.stubGlobal('Blob', BlobFinto);
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:finto', revokeObjectURL: () => {} });
  vi.stubGlobal('document', {
    createElement: () => ({ href: '', download: '', click() {}, remove() {} }),
    body: { appendChild() {} },
  });
  return () => {
    if (!scritto) throw new Error('nessun file scritto');
    return new Uint8Array(scritto);
  };
}

const COL_DATA: DefColonna = {
  chiave: 'scadenza', intestazione: 'Scadenza', predefinita: true, larghezza: 120,
};
const COL_TESTO: DefColonna = {
  chiave: 'odl', intestazione: 'ODL', predefinita: true, larghezza: 110,
};

const riga = (odl: string, scadenza: string | null) => ({ odl, scadenza }) as unknown as RigaTabella;

describe('esportaVista — le date sono date', () => {
  it('scrive la data come numero di calendario, non come testo', async () => {
    const leggi = catturaFoglio();
    await esportaVista([riga('912', '2026-12-10')], [COL_TESTO, COL_DATA], 'x.xlsx', 'ACEA');

    const XLSX = await import('xlsx');
    // `cellNF`: rileggere il formato numerico è opt-in, senza torna solo il valore.
    const wb = XLSX.read(leggi(), { type: 'array', cellNF: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // B2: prima riga di dati, colonna Scadenza. `t: 'n'` è tutta la differenza — è ciò che rende
    // l'ordinamento un ordinamento di date invece che di caratteri.
    expect(ws.B2.t).toBe('n');
    expect(ws.B2.v).toBe(serialeExcel('2026-12-10'));
    // E si deve LEGGERE come una data, o in cella comparirebbe 46366.
    expect(String(ws.B2.z ?? '')).toMatch(/d{1,2}\/m{1,2}\/yyyy/i);
  });

  it('ordinando la colonna, dicembre viene prima di gennaio dell’anno dopo', async () => {
    // Il difetto vero: da testo, '02/01/2027' precede '10/12/2026' perché '0' < '1'.
    const leggi = catturaFoglio();
    await esportaVista(
      [riga('a', '2026-12-10'), riga('b', '2027-01-02')],
      [COL_TESTO, COL_DATA],
      'x.xlsx',
      'ACEA',
    );

    const XLSX = await import('xlsx');
    const ws = XLSX.read(leggi(), { type: 'array' }).Sheets.ACEA;
    expect(Number(ws.B3.v)).toBeGreaterThan(Number(ws.B2.v));
  });

  it('una data che non c’è resta una cella vuota, non il 30/12/1899', async () => {
    const leggi = catturaFoglio();
    await esportaVista([riga('912', null)], [COL_TESTO, COL_DATA], 'x.xlsx', 'ACEA');

    const XLSX = await import('xlsx');
    const ws = XLSX.read(leggi(), { type: 'array' }).Sheets.ACEA;
    // Il seriale 0 È il 30/12/1899: un buco formattato come data sembrerebbe un giorno vero.
    expect(ws.B2?.t).not.toBe('n');
  });

  it('le colonne di testo restano testo', async () => {
    const leggi = catturaFoglio();
    await esportaVista([riga('912214964', '2026-12-10')], [COL_TESTO, COL_DATA], 'x.xlsx', 'ACEA');

    const XLSX = await import('xlsx');
    const ws = XLSX.read(leggi(), { type: 'array' }).Sheets.ACEA;
    // L'ODL è una sequenza di cifre che NON è un numero: come numero perderebbe gli zeri iniziali
    // e si leggerebbe in notazione scientifica.
    expect(ws.A2.t).toBe('s');
    expect(ws.A2.v).toBe('912214964');
  });
});
