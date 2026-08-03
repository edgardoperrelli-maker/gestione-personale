import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Forma della migration delle ceste di magazzino. Il DB non è raggiungibile dai test: si
 * controlla il TESTO, cioè le proprietà che se saltano saltano in silenzio — additività,
 * tipo della colonna, unicità della configurazione.
 */
const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260803180000_acqualatina_ceste.sql'),
  'utf8',
).toLowerCase();

describe('migrazione ceste AcquaLatina', () => {
  it('aggiunge `cesta` in modo additivo e rieseguibile', () => {
    expect(sql).toMatch(/alter table public\.acqualatina_misuratori_rimossi\s+add column if not exists cesta text/);
  });

  it('la cesta è TEXT: è un riferimento, non una quantità', () => {
    // Con un integer «A1» non entrerebbe e gli zeri di testa sparirebbero — lo stesso motivo
    // per cui il pallet è text (20260731190000).
    expect(sql).not.toMatch(/add column if not exists cesta\s+(integer|int|numeric|bigint)/);
  });

  it('NON tocca il registro ACEA: ciclo logistico diverso, nessuna richiesta', () => {
    expect(sql).not.toMatch(/alter table public\.misuratori_rimossi/);
  });

  it('la configurazione è una riga sola, garantita dal DB', () => {
    expect(sql).toContain('id          boolean     primary key default true');
    expect(sql).toMatch(/check \(id\)/);
  });

  it('l\'intervallo è coerente o assente: un solo estremo non descrive niente', () => {
    expect(sql).toMatch(/numero_min is null and numero_max is null/);
    expect(sql).toMatch(/numero_max >= numero_min/);
    // Le ceste si contano da 1: uno zero in configurazione produrrebbe un menu con una voce fantasma.
    expect(sql).toMatch(/numero_min >= 1/);
  });

  it('nasce vuota: «non configurato» è uno stato legittimo, non un difetto da riempire', () => {
    expect(sql).toMatch(/values \(true, null, null\)/);
    expect(sql).toContain('on conflict (id) do nothing');
  });

  it('ha RLS accesa con la sola lettura agli autenticati (come il registro)', () => {
    expect(sql).toContain('alter table public.acqualatina_ceste enable row level security');
    expect(sql).toMatch(/for select to authenticated using \(true\)/);
    expect(sql).not.toMatch(/for (insert|update|delete) to authenticated/);
  });
});
