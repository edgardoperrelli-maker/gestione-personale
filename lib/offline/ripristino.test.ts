import { describe, it, expect } from 'vitest';
import { riapriItemBloccato } from './ripristino';
import type { OutboxItem } from './types';

const bloccato = (extra: Partial<OutboxItem> = {}): OutboxItem => ({
  id: 'r1',
  type: 'manuale',
  token: 'tok',
  createdAt: 1000,
  tentativi: 5,
  stato: 'bloccato',
  ultimoErrore: 'Dati non validi',
  payload: { committente: 'lim_massive', anagrafica: {}, risposte: {}, fotoBlobRefs: [] },
  ...extra,
} as OutboxItem);

// `sincronizzaToken` filtra via gli item `bloccato`: finché restano tali non ripartono MAI,
// nemmeno dopo che il server è stato corretto. Il rientro è l'unica alternativa a «Rimuovi».
describe('riapriItemBloccato', () => {
  it('rimette in coda: stato in_attesa, tentativi azzerati, motivo ripulito', () => {
    const r = riapriItemBloccato(bloccato());
    expect(r.stato).toBe('in_attesa');
    expect(r.tentativi).toBe(0);
    expect(r.ultimoErrore).toBeUndefined();
  });

  it('conserva identità e contenuto della pratica: è un rientro, non una nuova richiesta', () => {
    const it0 = bloccato();
    const r = riapriItemBloccato(it0);
    expect(r.id).toBe(it0.id);
    expect(r.type).toBe(it0.type);
    expect(r.token).toBe(it0.token);
    expect(r.createdAt).toBe(it0.createdAt);
    expect(r.payload).toEqual(it0.payload);
  });

  it("non muta l'originale", () => {
    const it0 = bloccato();
    riapriItemBloccato(it0);
    expect(it0.stato).toBe('bloccato');
    expect(it0.tentativi).toBe(5);
  });

  it('azzera i tentativi anche quando il blocco veniva dal tetto dei ritenta', () => {
    expect(riapriItemBloccato(bloccato({ tentativi: 99 })).tentativi).toBe(0);
  });
});
