import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Forma della migration che dà al registro AcquaLatina la colonna delle coordinate.
 *
 * Il DB non è raggiungibile dai test: si controlla il TESTO, cioè le due proprietà che se
 * saltano saltano in silenzio — l'idempotenza (la migration si rilancia) e, soprattutto, che
 * la colonna resti FUORI da `acea_ordini`. Quest'ultimo non è pignoleria: la select del registro
 * è una sola per due tabelle, e una colonna che esiste di qua e non di là è esattamente il modo
 * in cui il 05/08 il registro si è spento su tutte le famiglie.
 */
const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260806090000_acqualatina_ordini_coordinate.sql'),
  'utf8',
);
/** Il solo SQL: i commenti nominano `acea_ordini` apposta, per spiegare perché NON si tocca. */
const istruzioni = sql.replace(/^\s*--.*$/gm, '');

describe('migrazione coordinate (registro AcquaLatina)', () => {
  it('aggiunge `coordinate` ad acqualatina_ordini', () => {
    expect(sql).toMatch(/alter table public\.acqualatina_ordini\s+add column if not exists coordinate text/i);
  });

  it('è idempotente: `if not exists`', () => {
    expect(sql).toMatch(/add column if not exists/i);
  });

  it('NON tocca acea_ordini: la colonna è di questa commessa sola', () => {
    expect(istruzioni).not.toMatch(/\bpublic\.acea_ordini\b/);
  });

  it('non riscrive né cancella niente: è solo una colonna in più', () => {
    expect(istruzioni).not.toMatch(/\b(drop|delete|truncate|update)\b/i);
  });
});

/**
 * Il patto fra la migration e il codice che legge il registro: la colonna `coordinate` NON deve
 * comparire nella select condivisa `COLONNE`, che gira anche su `acea_ordini`. È la stessa
 * guardia che vale per `matricola_nuova`, scritta qui perché una regressione costerebbe il
 * registro di tutte e tre le famiglie, non una cella vuota.
 */
describe('la select condivisa del registro resta pulita', () => {
  const route = readFileSync(
    resolve(__dirname, '../../app/api/acea/ordini/route.ts'),
    'utf8',
  );
  const selectCondivisa = route.slice(
    route.indexOf('const COLONNE = ['),
    route.indexOf("].join(', ');"),
  );

  it('`coordinate` non è in COLONNE', () => {
    expect(selectCondivisa).not.toMatch(/'coordinate'/);
  });

  it('si legge a parte, e un errore di lettura non ferma il registro', () => {
    expect(route).toMatch(/colonna coordinate non letta/);
  });
});
