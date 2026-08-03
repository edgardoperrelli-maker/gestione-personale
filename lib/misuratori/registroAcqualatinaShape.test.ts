import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATI_MISURATORE } from '@/types/misuratori';
import { APP_MODULES } from '@/lib/moduleAccess';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260727150000_acqualatina_misuratori_rimossi.sql'),
  'utf8',
);

describe('registro misuratori AcquaLatina — migrazione', () => {
  it('gli stati del DB sono ESATTAMENTE quelli del modulo, nello stesso ordine', () => {
    // È l'invariante che rende riusabile il client: `MisuratoriClient` ordina il flusso
    // logistico per indice in STATI_MISURATORE e vieta la regressione. Se il CHECK
    // divergesse, la UI proporrebbe stati che il DB rifiuta.
    const check = sql.match(/acqualatina_misuratori_rimossi_stato_check[\s\S]*?\)\)/i)?.[0] ?? '';
    const nelDb = [...check.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(nelDb).toEqual([...STATI_MISURATORE]);
  });

  it('non porta i campi che il committente ha escluso dal registro', () => {
    // Lettura del vecchio contatore e calibro restano su rapportino e intervento.
    // Il PDR è gas: un misuratore d'acqua non ne ha uno.
    const create = sql.match(/CREATE TABLE IF NOT EXISTS public\.acqualatina_misuratori_rimossi[\s\S]*?\n\);/i)?.[0] ?? '';
    expect(create).not.toMatch(/\blettura\w*/i);
    expect(create).not.toMatch(/\bdiametro\b|\bcalibro\b/i);
    expect(create).not.toMatch(/^\s*pdr\b/im);
  });

  it("porta i campi che servono al magazzino: chi, quando, dove, quale matricola", () => {
    for (const c of ['data_esecuzione', 'esecutore', 'indirizzo', 'comune', 'matricola']) {
      expect(sql).toMatch(new RegExp(`^\\s*${c}\\s`, 'm'));
    }
    expect(sql).toMatch(/matricola\s+text\s+NOT NULL/i);
    expect(sql).toMatch(/data_esecuzione date\s+NOT NULL/i);
  });

  it("l'unicità su intervento_id rende idempotente il rinvio di un rapportino", () => {
    // L'upsert in app/api/r/[token]/invia usa onConflict: 'intervento_id'.
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*?\(intervento_id\)/i);
  });

  it("l'indice NON è parziale: ON CONFLICT non aggancia gli indici parziali", () => {
    /*
      La regressione da cui questo test nasce (2026-08-03). L'indice era stato creato con
      `WHERE (intervento_id IS NOT NULL)`, e con un indice parziale Postgres rifiuta
      `ON CONFLICT (intervento_id)` — «no unique or exclusion constraint matching». Cioè
      l'upsert del gancio dell'invio, unica porta d'ingresso del registro, falliva a OGNI
      rapportino AcquaLatina chiuso: 212 interventi positivi, registro a zero.

      Il predicato non aggiungeva nulla: in un unique btree i NULL sono già distinti fra loro.
      Si guarda lo stato FINALE — la migrazione originale resta com'è, è storia.
    */
    const correzione = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260803120000_acqualatina_misuratori_indice_upsert.sql'),
      'utf8',
    );
    // I commenti si tolgono PRIMA di cercare: quel file spiega l'indice vecchio citandolo per
    // esteso, e senza questa riga il test leggeva la spiegazione invece dello statement.
    const soloSql = correzione.replace(/--[^\n]*/g, '');
    const create = soloSql.match(/CREATE UNIQUE INDEX[\s\S]*?;/i)?.[0] ?? '';
    expect(create).toMatch(/\(intervento_id\)/i);
    expect(create).not.toMatch(/WHERE/i);
    // E l'indice vecchio deve essere tolto, altrimenti il parziale resta e vince lui.
    expect(soloSql).toMatch(/DROP INDEX IF EXISTS public\.acqualatina_misuratori_rimossi_intervento_key/i);
  });

  it('RLS attiva, scrittura al solo service role', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/FOR SELECT TO authenticated USING \(true\)/i);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });
});

describe('registro misuratori AcquaLatina — pallet (migrazione 20260731190000)', () => {
  const sqlPallet = readFileSync(
    resolve(__dirname, '../../supabase/migrations/20260731190000_acqualatina_misuratori_pallet.sql'),
    'utf8',
  );

  it('la colonna è TEXT e nullable: il riferimento lo scrive l\'ufficio, l\'assenza è «in cesta»', () => {
    expect(sqlPallet).toMatch(/add column if not exists pallet text/i);
    expect(sqlPallet).not.toMatch(/pallet\s+(integer|int|bigint)/i);
    expect(sqlPallet).not.toMatch(/pallet[^\n]*not null/i);
  });

  it('tocca SOLO la tabella AcquaLatina: ogni registro ha la SUA colonna', () => {
    /*
      L'invariante non è più «il pallet è di AcquaLatina» — dal 2026-08-03 ce l'hanno entrambi
      (20260803140000), perché il ciclo fisico si è rivelato lo stesso e il pallet era solo
      arrivato prima di qua. Quello che resta vero, ed è la cosa che questo test protegge, è
      che ogni migrazione tocca la SUA tabella: due colonne gemelle, non una condivisa.
    */
    expect(sqlPallet).toMatch(/alter table public\.acqualatina_misuratori_rimossi/i);
    expect(sqlPallet).not.toMatch(/alter table public\.misuratori_rimossi\b/i);

    const sqlAcea = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260803140000_acea_misuratori_pallet.sql'),
      'utf8',
    ).replace(/--[^\n]*/g, ''); // i commenti citano l'altra tabella: si spogliano prima
    expect(sqlAcea).toMatch(/alter table public\.misuratori_rimossi\b/i);
    expect(sqlAcea).not.toMatch(/alter table public\.acqualatina_misuratori_rimossi/i);
    // Stessa forma della gemella: text, nullable, additiva.
    expect(sqlAcea).toMatch(/add column if not exists pallet text/i);
    expect(sqlAcea).not.toMatch(/pallet\s+(integer|int|bigint)/i);
    expect(sqlAcea).not.toMatch(/pallet[^\n]*not null/i);
  });
});

describe('registro misuratori AcquaLatina — modulo', () => {
  it('è registrato in moduleAccess e riservato agli admin', () => {
    const def = APP_MODULES.find((m) => m.key === 'acqualatina');
    expect(def).toBeDefined();
    expect(def?.href).toBe('/hub/acqualatina');
    expect(def?.adminOnly).toBe(true);
    expect(def?.matchPrefixes).toContain('/hub/acqualatina');
  });

  it('il prefisso non cattura le rotte del registro ACEA e viceversa', () => {
    const acqua = APP_MODULES.find((m) => m.key === 'acqualatina')!;
    const acea = APP_MODULES.find((m) => m.key === 'misuratori')!;
    expect(acqua.matchPrefixes!.some((p) => '/hub/misuratori'.startsWith(p))).toBe(false);
    expect(acea.matchPrefixes!.some((p) => '/hub/acqualatina/misuratori'.startsWith(p))).toBe(false);
  });
});
