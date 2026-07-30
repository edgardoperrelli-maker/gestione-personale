import { describe, it, expect, vi, afterEach } from 'vitest';
import { caricaTutteLeRighe } from './esportaVista';

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
