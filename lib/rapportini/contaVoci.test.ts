// lib/rapportini/contaVoci.test.ts
// Verifica che il conteggio delle voci per rapportino superi il limite default
// di 1000 righe di PostgREST: senza paginazione il riepilogo mostrava conteggi
// 0/parziali per i rapportini le cui voci cadevano oltre la 1000ª riga.
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contaVociByRapportino } from './contaVoci';

/**
 * Fake Supabase che simula il troncamento di PostgREST: ogni risposta restituisce
 * AL MASSIMO `maxRows` righe (default 1000). Supporta la chain `.select().in().order().range()`.
 */
function makeFakeDb(voci: Array<{ id: string; rapportino_id: string }>, maxRows = 1000): SupabaseClient {
  class Builder {
    private idsFilter: string[] | null = null;
    private from = 0;
    private to = Number.MAX_SAFE_INTEGER;
    select() { return this; }
    in(_c: string, vals: string[]) { this.idsFilter = vals; return this; }
    order() { return this; }
    range(from: number, to: number) { this.from = from; this.to = to; return this; }
    then(resolve: (v: { data: Array<{ rapportino_id: string }>; error: null }) => void) {
      const filtered = this.idsFilter
        ? voci.filter((v) => this.idsFilter!.includes(v.rapportino_id))
        : voci.slice();
      // ordine stabile per id, poi applica range, poi tronca a maxRows (limite PostgREST)
      const ordered = filtered.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const sliced = ordered.slice(this.from, this.to + 1).slice(0, maxRows);
      resolve({ data: sliced.map((v) => ({ rapportino_id: v.rapportino_id })), error: null });
    }
  }
  return { from: () => new Builder() } as unknown as SupabaseClient;
}

describe('contaVociByRapportino', () => {
  it('ritorna {} per lista rapId vuota senza interrogare il db', async () => {
    const db = makeFakeDb([]);
    expect(await contaVociByRapportino(db, [])).toEqual({});
  });

  it('conta correttamente anche oltre il limite di 1000 righe (paginazione)', async () => {
    // rap A: 1500 voci, rap B: 1000 voci → totale 2500 > 1000.
    // Una singola query troncata a 1000 darebbe conteggi sbagliati/zero.
    const voci: Array<{ id: string; rapportino_id: string }> = [];
    const pad = (n: number) => n.toString().padStart(6, '0');
    for (let i = 0; i < 1500; i++) voci.push({ id: `a${pad(i)}`, rapportino_id: 'A' });
    for (let i = 0; i < 1000; i++) voci.push({ id: `b${pad(i)}`, rapportino_id: 'B' });

    const counts = await contaVociByRapportino(makeFakeDb(voci, 1000), ['A', 'B']);
    expect(counts).toEqual({ A: 1500, B: 1000 });
  });

  it('conta i rapportini con poche voci (nessuna paginazione necessaria)', async () => {
    const voci = [
      { id: 'x1', rapportino_id: 'X' },
      { id: 'x2', rapportino_id: 'X' },
      { id: 'y1', rapportino_id: 'Y' },
    ];
    const counts = await contaVociByRapportino(makeFakeDb(voci, 1000), ['X', 'Y']);
    expect(counts).toEqual({ X: 2, Y: 1 });
  });
});
