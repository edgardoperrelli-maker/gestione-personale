import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Il censimento che il campo consulta viene dal REGISTRO, non dallo staging dell'import.
 *
 * Il DB non è raggiungibile dai test e queste due letture non sono pure: si controlla il TESTO,
 * cioè l'unica proprietà che se salta salta in silenzio — la tabella interrogata. Tornare a
 * `template_master_righe` non romperebbe nessun tipo e nessuna schermata: rimetterebbe soltanto
 * la ricerca a guardare una fotografia scaduta, che è il difetto del 13/08/2026 (ODL 12386221 a
 * registro con la sua matricola, nei master attivi solo con la matricola vuota → «non censito»
 * su un ordine aperto).
 */
const sorgente = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
/** Il solo codice: i commenti nominano `template_master_righe` apposta, per dire perché NON si usa. */
const senzaCommenti = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(?:\/\/|\*).*$/gm, '');

describe('censimento AcquaLatina: la fonte è acqualatina_ordini', () => {
  const codice = senzaCommenti(sorgente('./censimentoMaster.ts'));

  it('legge il registro', () => {
    expect(codice).toMatch(/from\('acqualatina_ordini'\)/);
  });

  it('NON legge più lo staging dell import', () => {
    expect(codice).not.toMatch(/template_master_righe|template_master\b/);
  });

  it('scarta le righe senza matricola: un ordine senza contatore non è censimento', () => {
    expect(codice).toMatch(/\.not\('matricola', 'is', null\)/);
    expect(codice).toMatch(/\.neq\('matricola', ''\)/);
  });

  it("pre-filtra anche sull'ODL: senza, il gradino ODL non avrebbe righe su cui scattare", () => {
    expect(codice).toMatch(/ilike\('odl',/);
  });

  it("ricompone l'indirizzo da via + civico (il registro li tiene spezzati)", () => {
    expect(codice).toMatch(/via[\s\S]{0,40}civico/);
  });
});

/**
 * Il trigger che rende onesta la versione della cache offline. Senza, `max(aggiornato_il)` resta
 * fermo alla data di INSERT e un sync di sole correzioni non farebbe riscaricare niente ai
 * telefoni: il campo continuerebbe a cercare sul dato di prima, credendo di essere allineato.
 */
describe('migrazione: aggiornato_il sul registro AcquaLatina', () => {
  const sql = sorgente('../../supabase/migrations/20260813090000_acqualatina_ordini_aggiornato_il.sql');
  const istruzioni = sql.replace(/^\s*--.*$/gm, '');

  it('monta il trigger su acqualatina_ordini, before update', () => {
    expect(istruzioni).toMatch(
      /create trigger acqualatina_ordini_set_aggiornato_il before update on public\.acqualatina_ordini/i,
    );
  });

  it('usa la funzione già esistente, non ne crea una terza', () => {
    expect(istruzioni).toMatch(/execute function public\.set_aggiornato_il\(\)/i);
    expect(istruzioni).not.toMatch(/create (or replace )?function/i);
  });

  it('è idempotente: `drop trigger if exists` prima di crearlo', () => {
    expect(istruzioni).toMatch(/drop trigger if exists acqualatina_ordini_set_aggiornato_il/i);
  });

  it('non riscrive né cancella dati: è solo un trigger', () => {
    expect(istruzioni).not.toMatch(/\b(delete|truncate|alter table)\b/i);
    // `update` compare in «before update», che è la definizione del trigger: qui si vieta
    // l'UPDATE come istruzione, cioè a inizio riga.
    expect(istruzioni).not.toMatch(/^\s*update\b/im);
  });

  it('NON tocca acea_ordini: quello il trigger ce l ha dal 28/07', () => {
    expect(istruzioni).not.toMatch(/\bacea_ordini\b/);
  });
});
