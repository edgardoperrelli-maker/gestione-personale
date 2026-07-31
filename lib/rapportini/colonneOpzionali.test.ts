import { describe, it, expect } from 'vitest';
import { erroreColonnaMancante, scriviSenzaColonnaMancante, selectDegradante } from './colonneOpzionali';

const MANCA_LISTA = { code: '42703', message: 'column rapportino_template.lista_campi does not exist' };
const MANCA_IN_CACHE = { code: 'PGRST204', message: "Could not find the 'lista_campi' column of 'rapportino_template'" };

describe('selectDegradante', () => {
  it('con tutte le colonne presenti fa una sola query', async () => {
    const viste: string[] = [];
    const res = await selectDegradante('id, nome', ['riservato_pi', 'lista_campi'], (colonne) => {
      viste.push(colonne);
      return Promise.resolve({ data: [{ id: '1' }], error: null });
    });
    expect(viste).toEqual(['id, nome, riservato_pi, lista_campi']);
    expect(res.data).toEqual([{ id: '1' }]);
  });

  it('colonna nuova mancante: ritenta senza, la pagina resta viva', async () => {
    const viste: string[] = [];
    const res = await selectDegradante('id, nome', ['riservato_pi', 'lista_campi'], (colonne) => {
      viste.push(colonne);
      return Promise.resolve(
        colonne.includes('lista_campi')
          ? { data: null, error: MANCA_LISTA }
          : { data: [{ id: '1' }], error: null },
      );
    });
    expect(viste).toEqual(['id, nome, riservato_pi, lista_campi', 'id, nome, riservato_pi']);
    expect(res.error).toBeNull();
  });

  it('scende fino alle sole colonne base', async () => {
    const viste: string[] = [];
    await selectDegradante('id, nome', ['riservato_pi', 'lista_campi'], (colonne) => {
      viste.push(colonne);
      return Promise.resolve(
        colonne === 'id, nome' ? { data: [], error: null } : { data: null, error: MANCA_LISTA },
      );
    });
    expect(viste).toEqual(['id, nome, riservato_pi, lista_campi', 'id, nome, riservato_pi', 'id, nome']);
  });
});

describe('erroreColonnaMancante', () => {
  it('riconosce 42703 e PGRST204 sulla colonna indicata', () => {
    expect(erroreColonnaMancante(MANCA_LISTA, 'lista_campi')).toBe(true);
    expect(erroreColonnaMancante(MANCA_IN_CACHE, 'lista_campi')).toBe(true);
  });

  it('non confonde un altro errore con la colonna mancante', () => {
    expect(erroreColonnaMancante(null, 'lista_campi')).toBe(false);
    expect(erroreColonnaMancante({ code: '23505', message: 'duplicate key' }, 'lista_campi')).toBe(false);
    expect(erroreColonnaMancante({ code: '42703', message: 'column x.altro does not exist' }, 'lista_campi')).toBe(false);
  });
});

describe('scriviSenzaColonnaMancante', () => {
  it('scrive tutto quando la colonna c’è', async () => {
    const tentativi: Record<string, unknown>[] = [];
    const res = await scriviSenzaColonnaMancante({ nome: 'A', lista_campi: { sub: [] } }, 'lista_campi', (v) => {
      tentativi.push(v);
      return Promise.resolve({ data: [{ id: '1' }], error: null });
    });
    expect(tentativi).toHaveLength(1);
    expect(res.error).toBeNull();
  });

  it('colonna mancante: ritenta senza, il resto della patch si salva', async () => {
    const tentativi: Record<string, unknown>[] = [];
    const res = await scriviSenzaColonnaMancante({ nome: 'A', lista_campi: { sub: [] } }, 'lista_campi', (v) => {
      tentativi.push(v);
      return Promise.resolve(
        'lista_campi' in v ? { data: null, error: MANCA_IN_CACHE } : { data: [{ id: '1' }], error: null },
      );
    });
    expect(tentativi).toEqual([{ nome: 'A', lista_campi: { sub: [] } }, { nome: 'A' }]);
    expect(res.error).toBeNull();
  });

  it('un errore diverso NON viene mascherato da un secondo tentativo', async () => {
    let chiamate = 0;
    const res = await scriviSenzaColonnaMancante({ nome: 'A' }, 'lista_campi', () => {
      chiamate += 1;
      return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
    });
    expect(chiamate).toBe(1);
    expect(res.error?.code).toBe('23505');
  });
});
