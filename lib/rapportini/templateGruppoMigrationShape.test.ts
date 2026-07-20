import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260720190000_template_gruppo_attivita.sql'),
  'utf8',
);

describe('migrazione template_gruppo_attivita', () => {
  it('aggiunge le colonne di collegamento (idempotente)', () => {
    expect(sql).toMatch(/add column if not exists gruppo_committente text/i);
    expect(sql).toMatch(/add column if not exists gruppi_attivita text\[\]/i);
  });

  it('vincola il committente della gerarchia a acea|italgas|acqualatina', () => {
    expect(sql).toMatch(/gruppo_committente_check/);
    expect(sql).toMatch(/'acqualatina'/);
  });

  it('vincola la coppia: collegato = committente + almeno un gruppo', () => {
    expect(sql).toMatch(/gruppo_coppia_check/);
    expect(sql).toMatch(/cardinality\(gruppi_attivita\) = 0/);
  });

  it('seed idempotente: ogni collegamento aggancia per nome e solo se non già collegato', () => {
    const updates = sql.match(/update rapportino_template set gruppo_committente/gi) ?? [];
    const guardie = sql.match(/and gruppo_committente is null/gi) ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(6);
    expect(guardie.length).toBe(updates.length);
  });

  it('escapa l\'apostrofo del gruppo ATTIVITA\' ALLA CLIENTELA', () => {
    expect(sql).toContain("ATTIVITA'' ALLA CLIENTELA");
  });
});
