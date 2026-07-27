import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260727140000_contratti.sql'),
  'utf8',
);

describe('migrazione contratti', () => {
  it('crea la gerarchia committenti → contratti → territori', () => {
    for (const t of ['committenti', 'contratti', 'contratto_territori']) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`, 'i'));
    }
    expect(sql).toMatch(/contratti[\s\S]*?REFERENCES public\.committenti\(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(/contratto_id[\s\S]*?REFERENCES public\.contratti\(id\) ON DELETE CASCADE/i);
  });

  it('il territorio di copertura aggancia il master territories in modo OPZIONALE', () => {
    // Un comune coperto non è per forza un territorio di pianificazione: se il
    // territorio master sparisce, la riga di contratto resta (SET NULL, non CASCADE).
    expect(sql).toMatch(/territory_id\s+uuid\s+REFERENCES public\.territories\(id\) ON DELETE SET NULL/i);
  });

  it('assorbe la vecchia anagrafica CONSERVANDO gli UUID', () => {
    // È ciò che rende lossless il repuntamento delle FK di appointments.
    expect(sql).toMatch(/INSERT INTO public\.committenti \(id, nome, attivo, created_at\)/i);
    expect(sql).toMatch(/INSERT INTO public\.contratto_territori \(id, contratto_id, nome, attivo, created_at\)/i);
  });

  it('ripunta le FK di appointments PRIMA di droppare le vecchie tabelle', () => {
    const posFk = sql.search(/ADD CONSTRAINT appointments_committente_id_fkey/i);
    const posDrop = sql.search(/DROP TABLE IF EXISTS public\.appuntamenti_committenti/i);
    expect(posFk).toBeGreaterThan(-1);
    expect(posDrop).toBeGreaterThan(posFk);
    expect(sql).toMatch(/appointments_appuntamento_territorio_id_fkey[\s\S]*?REFERENCES public\.contratto_territori\(id\)/i);
  });

  it('promuove acea_listino a listino generale senza perdere la colonna committente', () => {
    expect(sql).toMatch(/ALTER TABLE IF EXISTS public\.acea_listino RENAME TO listino/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS contratto_id uuid/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS azione_chiave text/i);
    // I 4 consumer del motore economico ACEA continuano a filtrare su `committente`:
    // la colonna NON va rimossa da questa migrazione.
    expect(sql).not.toMatch(/DROP COLUMN[\s\S]{0,40}committente/i);
  });

  it("l'unicità del listino tiene conto dell'extra (NULL non collide con NULL in SQL)", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS acea_listino_attivita_idx/i);
    expect(sql).toMatch(/coalesce\(azione_chiave, ''\)/i);
  });

  it('semina AcquaLatina a prezzo zero: base + extra saracinesca', () => {
    expect(sql).toContain("'Sostituzione misuratore'");
    expect(sql).toContain("'saracinesca'");
    // I codoli sono compresi nel prezzo: non devono avere una riga di listino.
    expect(sql).not.toMatch(/'codoli'/i);
  });

  it('RLS attiva su tutte e tre le tabelle nuove, lettura ai soli autenticati', () => {
    for (const t of ['committenti', 'contratti', 'contratto_territori']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE POLICY ${t}_select`, 'i'));
    }
    expect(sql.match(/FOR SELECT TO authenticated USING \(true\)/gi) ?? []).toHaveLength(3);
  });

  it('è idempotente: ogni INSERT porta la sua guardia NOT EXISTS', () => {
    // Il confronto è per STATEMENT (fino al `;`), non sul file intero: così una guardia
    // in più su un insert non copre la mancanza su un altro. Le guardie sono scritte sia
    // come `WHERE NOT EXISTS` sia come `AND NOT EXISTS`, a seconda del filtro già presente.
    const statement = sql.split(';');
    const insert = statement.filter((s) => /INSERT INTO/i.test(s));
    expect(insert.length).toBe(7);
    for (const s of insert) {
      const tabella = s.match(/INSERT INTO public\.(\w+)/i)?.[1];
      expect(/(WHERE|AND)\s+NOT EXISTS\s*\(/i.test(s), `INSERT senza guardia: ${tabella}`).toBe(true);
    }
  });
});
