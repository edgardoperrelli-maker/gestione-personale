import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000003_lucchetti_manuali_liberi.sql'),
  'utf8',
);

describe('migrazione lucchetti_manuali_liberi', () => {
  it('aggiunge la colonna manuali_liberi a mappa_piani_lucchetti', () => {
    expect(sql).toMatch(
      /alter table mappa_piani_lucchetti\s+add column if not exists manuali_liberi boolean not null default false/i,
    );
  });
});
