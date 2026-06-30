// tools/limitazioni-sync/lib/acea/assegnaInterventi.test.ts
import { describe, it, expect, vi } from 'vitest';
import { orchestraAssegnazioni } from './assegnaInterventi.mjs';

const r = (odl: string, operatoreAcea = 'ROSSI') => ({ odl, operatoreAcea });

describe('orchestraAssegnazioni', () => {
  it('un solo passo: tutti assegnati, una sola chiamata', async () => {
    const runGiro = vi.fn(async (lista: { odl: string }[]) => ({
      fatti: lista.map((x) => ({ odl: x.odl, esito: 'assegnato' })),
      daRitentare: [],
    }));
    const { esiti } = await orchestraAssegnazioni([r('1'), r('2')], runGiro, { chunk: 20 });
    expect(esiti).toEqual([{ odl: '1', esito: 'assegnato' }, { odl: '2', esito: 'assegnato' }]);
    expect(runGiro).toHaveBeenCalledTimes(1);
  });

  it('spezza in blocchi da `chunk` (una sessione fresca per blocco)', async () => {
    const runGiro = vi.fn(async (lista: { odl: string }[]) => ({
      fatti: lista.map((x) => ({ odl: x.odl, esito: 'assegnato' })),
      daRitentare: [],
    }));
    const righe = Array.from({ length: 45 }, (_, i) => r(String(i)));
    const { esiti } = await orchestraAssegnazioni(righe, runGiro, { chunk: 20 });
    expect(esiti).toHaveLength(45);
    expect(runGiro).toHaveBeenCalledTimes(3); // 20 + 20 + 5
    expect((runGiro.mock.calls[0][0] as unknown[]).length).toBe(20);
    expect((runGiro.mock.calls[2][0] as unknown[]).length).toBe(5);
  });

  it('recupera la cascata: i rimandati vanno a una sessione fresca al passo successivo', async () => {
    let passo = 0;
    const runGiro = vi.fn(async (lista: { odl: string }[]) => {
      passo++;
      if (passo === 1) {
        // il primo ODL passa, il resto "form perso" → rimandato
        return {
          fatti: [{ odl: lista[0].odl, esito: 'assegnato' }],
          daRitentare: lista.slice(1).map((x) => ({ r: x, motivo: 'maschera persa' })),
        };
      }
      return { fatti: lista.map((x) => ({ odl: x.odl, esito: 'assegnato' })), daRitentare: [] };
    });
    const { esiti } = await orchestraAssegnazioni([r('1'), r('2'), r('3')], runGiro, { chunk: 20 });
    expect(esiti.filter((e: { esito: string }) => e.esito === 'assegnato')).toHaveLength(3);
    expect(passo).toBe(2);
  });

  it('si ferma dopo `stopDopoFermi` passi senza progresso e marca "non assegnato"', async () => {
    const runGiro = vi.fn(async (lista: { odl: string }[]) => ({
      fatti: [],
      daRitentare: lista.map((x) => ({ r: x, motivo: 'ordine bloccato' })),
    }));
    const { esiti } = await orchestraAssegnazioni([r('1')], runGiro, { chunk: 20, stopDopoFermi: 2 });
    expect(runGiro).toHaveBeenCalledTimes(2);
    expect(esiti).toEqual([{ odl: '1', esito: 'non assegnato', motivo: 'ordine bloccato' }]);
  });

  it('un `fallito` di passo intermittente viene RITENTATO e recupera (sessione fresca)', async () => {
    let passo = 0;
    const runGiro = vi.fn(async (lista: { odl: string }[]) => {
      passo++;
      // 1° giro: l'ODL fallisce allo step inserisci; 2° giro (fresco): va a buon fine
      return passo === 1
        ? { fatti: lista.map((x) => ({ odl: x.odl, esito: 'fallito', motivo: 'passo "inserisci-..."' })), daRitentare: [] }
        : { fatti: lista.map((x) => ({ odl: x.odl, esito: 'assegnato' })), daRitentare: [] };
    });
    const { esiti } = await orchestraAssegnazioni([r('1')], runGiro, { chunk: 20 });
    expect(esiti).toEqual([{ odl: '1', esito: 'assegnato' }]);
    expect(runGiro).toHaveBeenCalledTimes(2);
  });

  it('un `fallito` persistente viene ritentato UNA sola volta poi chiuso fallito', async () => {
    const runGiro = vi.fn(async (lista: { odl: string }[]) => ({
      fatti: lista.map((x) => ({ odl: x.odl, esito: 'fallito', motivo: 'passo "seleziona-..."' })),
      daRitentare: [],
    }));
    const { esiti } = await orchestraAssegnazioni([r('1')], runGiro, { chunk: 20 });
    expect(esiti).toEqual([{ odl: '1', esito: 'fallito', motivo: 'passo "seleziona-..."' }]);
    expect(runGiro).toHaveBeenCalledTimes(2); // 1 tentativo + 1 ritentativo, poi basta
  });
});
