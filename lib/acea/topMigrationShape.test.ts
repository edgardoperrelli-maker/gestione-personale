import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260804110000_acea_ordini_top.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');

describe('migrazione TOP', () => {
  it('la colonna nasce su ENTRAMBE le tabelle del registro', () => {
    // La select di app/api/acea/ordini/route.ts è UNA per due tabelle: metterla solo di qua
    // farebbe fallire la query dell'altra, cioè spegnerebbe il registro AcquaLatina.
    expect(sql).toMatch(/alter table public\.acea_ordini\s+add column if not exists top boolean/i);
    expect(sql).toMatch(/alter table public\.acqualatina_ordini\s+add column if not exists top boolean/i);
  });

  it('default false e not null: «non TOP» non è un buco, è lo stato normale', () => {
    const occorrenze = sql.match(/top boolean not null default false/gi) ?? [];
    expect(occorrenze).toHaveLength(2);
  });

  it("l'indice è PARZIALE: le righe TOP sono poche decine su migliaia", () => {
    const idx = sql.match(/create index if not exists acea_ordini_top_idx[\s\S]*?;/i)?.[0] ?? '';
    expect(idx).not.toBe('');
    expect(idx).toMatch(/where top/i);
  });

  it('è additiva e rieseguibile: nessun drop, nessuna riga toccata', () => {
    expect(sql).not.toMatch(/drop column/i);
    expect(sql).not.toMatch(/\bupdate\b/i);
  });

  it("l'import di ACEA non deve conoscere il TOP: è una colonna NOSTRA", () => {
    /*
      È la ragione per cui il flag sopravvive al reimport: `applicaImport` scrive solo le colonne
      che arrivano dall'export del committente. Il giorno che qualcuno ci infilasse `top`, ogni
      import azzererebbe le marcature dell'ufficio senza dire niente — esattamente come già
      accade, per costruzione, agli ordini annullati.
    */
    const importer = readFileSync(resolve(__dirname, './applicaImport.ts'), 'utf8');
    expect(importer).not.toMatch(/\btop\b/);
  });
});
