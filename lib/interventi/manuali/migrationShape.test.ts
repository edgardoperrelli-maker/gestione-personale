import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000000_interventi_manuali.sql'),
  'utf8',
);

describe('migrazione interventi_manuali', () => {
  it('crea la tabella interventi_manuali', () => {
    expect(sql).toMatch(/create table if not exists interventi_manuali/i);
  });
  it('vincola committente e stato', () => {
    expect(sql).toMatch(/committente text[^,]*check \(committente in \('acea','italgas','altro'\)\)/i);
    expect(sql).toMatch(/stato text[^,]*check \(stato in \('in_attesa','approvato','rifiutato','auto_liberi','annullato'\)\)/i);
  });
  it('vincola corsia con default normale', () => {
    expect(sql).toMatch(/corsia text[^,]*default 'normale'[^,]*check \(corsia in \('normale','liberi'\)\)/i);
  });
  it('crea gli indici richiesti', () => {
    expect(sql).toMatch(/idx_interventi_manuali_stato/i);
    expect(sql).toMatch(/idx_interventi_manuali_rapportino/i);
    expect(sql).toMatch(/idx_interventi_manuali_data/i);
    expect(sql).toMatch(/idx_interventi_manuali_staff_data/i);
  });
  it('abilita RLS for all to authenticated', () => {
    expect(sql).toMatch(/alter table interventi_manuali enable row level security/i);
    expect(sql).toMatch(/for all to authenticated using \(true\) with check \(true\)/i);
  });
  it('aggancia il trigger updated_at', () => {
    expect(sql).toMatch(/create trigger interventi_manuali_set_updated_at before update on interventi_manuali/i);
  });
  it('ALTER voci/interventi/template', () => {
    expect(sql).toMatch(/alter table rapportino_voci\s+add column if not exists manuale boolean not null default false/i);
    expect(sql).toMatch(/add column if not exists approvazione_stato text/i);
    expect(sql).toMatch(/add column if not exists richiesta_id uuid/i);
    expect(sql).toMatch(/alter table interventi\s+add column if not exists origine text not null default 'pianificato'/i);
    expect(sql).toMatch(/alter table rapportino_template\s+add column if not exists committente text/i);
  });
});
