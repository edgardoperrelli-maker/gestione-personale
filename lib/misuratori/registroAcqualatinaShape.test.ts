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

describe('un solo riferimento di magazzino (migrazione 20260804090000)', () => {
  /*
    Cesta e pallet erano la stessa cosa con due nomi: un contenitore numerato con cui la
    riconsegna viaggia. Il modello a due gradini descriveva un ciclo che il magazzino non fa,
    e questa migration lo chiude — mentre il pallet era ancora a ZERO righe su entrambi i
    registri, cioè finché la fusione era una rinomina e non una migrazione di dati.
  */
  const sql = readFileSync(
    resolve(__dirname, '../../supabase/migrations/20260804090000_cesta_unico_riferimento.sql'),
    'utf8',
  );
  const soloSql = sql.replace(/--[^\n]*/g, ''); // i commenti raccontano la storia e citano i nomi vecchi

  it('su ACEA la colonna si RINOMINA: è la stessa, non una nuova', () => {
    // Rinominare invece di aggiungere-e-cancellare tiene i privilegi, i default e — se un
    // giorno ci fosse — il contenuto. Qui è vuota, ma il gesto giusto è gratis.
    expect(soloSql).toMatch(/alter table public\.misuratori_rimossi rename column pallet to cesta/i);
  });

  it('la rinomina è idempotente e non presume lo stato di partenza', () => {
    // Un database dove la colonna è già `cesta` (o dove non c'è mai stato niente) non deve
    // far fallire la migration: il `do $$` guarda information_schema prima di toccare.
    expect(soloSql).toMatch(/information_schema\.columns/i);
    expect(soloSql).toMatch(/add column if not exists cesta text/i);
  });

  it('su AcquaLatina il pallet si elimina, ma solo se è davvero vuoto', () => {
    // La guardia è il punto: se fra la scrittura e l'applicazione qualcuno avesse impallettato
    // davvero, la migration si ferma invece di buttare via i numeri.
    expect(soloSql).toMatch(/raise exception/i);
    expect(soloSql).toMatch(/where pallet is not null/i);
    expect(soloSql).toMatch(/alter table public\.acqualatina_misuratori_rimossi\s+drop column if exists pallet/i);
  });

  it('la cesta di AcquaLatina non si tocca: è quella scritta dagli operatori', () => {
    expect(soloSql).not.toMatch(/acqualatina_misuratori_rimossi[\s\S]*?drop column if exists cesta/i);
    expect(soloSql).not.toMatch(/rename column cesta/i);
  });

  it("l'indice per «cosa c'è nella cesta 3?» c'è anche su ACEA, ed è parziale", () => {
    // Le righe ancora in furgone (cesta null) sono la maggioranza e non hanno niente da dire
    // a questa domanda: stessa forma dell'indice gemello su AcquaLatina.
    const idx = soloSql.match(/create index if not exists misuratori_rimossi_cesta_idx[\s\S]*?;/i)?.[0] ?? '';
    expect(idx).not.toBe('');
    expect(idx).toMatch(/where cesta is not null/i);
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
