import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000002_interventi_manuali_realtime.sql'),
  'utf8',
);

describe('migrazione realtime interventi_manuali', () => {
  it('aggiunge la tabella alla publication in modo idempotente', () => {
    expect(sql).toMatch(/pg_publication_tables/i);
    expect(sql).toMatch(/pubname\s*=\s*'supabase_realtime'/i);
    expect(sql).toMatch(/tablename\s*=\s*'interventi_manuali'/i);
    expect(sql).toMatch(/alter publication supabase_realtime add table interventi_manuali/i);
  });
  it('è racchiusa in un blocco do $$ … end $$', () => {
    expect(sql).toMatch(/do \$\$/i);
    expect(sql).toMatch(/end \$\$;/i);
  });
});
