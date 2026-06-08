import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000004_template_solo_manuale.sql'),
  'utf8',
);

describe('migrazione template_solo_manuale', () => {
  it('aggiunge la colonna solo_manuale con default false', () => {
    expect(sql).toMatch(/add column if not exists solo_manuale boolean not null default false/i);
  });
});
