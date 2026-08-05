import { describe, it, expect, beforeEach, vi } from 'vitest';

/*
  Fake minimo di Supabase: regge la sola catena usata da `comuniMassive.ts`
  (`from(t).select(...).eq(col, val)`). `tabelleLette` è il punto del test: dopo il ritiro
  dell'agente questo file deve leggere UNA tabella sola, e un fake che registra i nomi lo
  dimostra senza dover leggere il sorgente con una regex.
*/
type Riga = Record<string, unknown>;
let righe: Riga[] = [];
let tabelleLette: string[] = [];

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (t: string) => {
      tabelleLette.push(t);
      return {
        select: () => ({
          eq: (col: string, val: unknown) =>
            Promise.resolve({ data: righe.filter((r) => r[col] === val), error: null }),
        }),
      };
    },
  },
}));

const { caricaComuniMassive } = await import('./comuniMassive');

const massive = (comune: string): Riga => ({ famiglia: 'massive', comune });

beforeEach(() => {
  righe = [];
  tabelleLette = [];
});

describe('caricaComuniMassive — una fonte sola dopo il ritiro dell\'agente', () => {
  it('i comuni arrivano dal registro degli ordini, normalizzati in chiave', async () => {
    righe = [massive('ZAGAROLO'), massive('LABICO'), massive('RIGNANO FLAMINIO')];
    const set = await caricaComuniMassive();
    expect([...set].sort()).toEqual(['LABICO', 'RIGNANO FLAMINIO', 'ZAGAROLO']);
  });

  it('NON legge più i file master dell\'agente: una sola tabella interrogata', async () => {
    righe = [massive('ZAGAROLO')];
    await caricaComuniMassive();
    expect(tabelleLette).toEqual(['acea_ordini']);
    expect(tabelleLette).not.toContain('agente_file_colonne');
  });

  it('registro vuoto → insieme vuoto: nessun comune trattato come speciale', async () => {
    righe = [];
    expect((await caricaComuniMassive()).size).toBe(0);
  });

  it('la query filtra per famiglia: il dunning non porta comuni nel set', async () => {
    righe = [massive('ZAGAROLO'), { famiglia: 'dunning', comune: 'ROMA' }];
    const set = await caricaComuniMassive();
    expect([...set]).toEqual(['ZAGAROLO']);
  });
});
