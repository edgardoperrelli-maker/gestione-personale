import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  L'attività dell'ordine la dichiara ACEA, e la conseguenza è un magazzino.

  Questi test non provano la logica (quella sta in attivitaDaImport.test.ts): proteggono i due
  punti che si slacciano da soli — la rotta che deve chiamare il modulo puro invece di rifarsi la
  sua copia, e la migration di recupero che ripete in SQL il predicato di `isRimozioneTipo`.
  Sono le stesse due crepe da cui è nato il caso: una classificazione ferma alla pianificazione e
  un registro derivato che nessuno riallineava.
*/

const leggi = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const route = leggi('../../app/api/acea/import/route.ts');
const migration = leggi('../../supabase/migrations/20260804090000_acea_attivita_da_import.sql');
const gate = leggi('../interventi/rimozioneMisuratore.ts');

describe("import ACEA — il riallineamento dell'attività passa dal modulo puro", () => {
  it('la rotta usa `allineamentiDaImport`, non una sua copia della regola', () => {
    expect(route).toMatch(/from '@\/lib\/acea\/attivitaDaImport'/);
    expect(route).toMatch(/allineamentiDaImport\(/);
  });

  it('scrive solo sul committente dichiarato dal modulo', () => {
    /*
      `lim_massive` fuori dal RIALLINEAMENTO: la sua canonica unica è una scelta, non un
      disallineamento. Resta dentro alla correzione degli esiti — ACEA paga anche il massive —
      quindi l'esclusione si verifica sul corpo della funzione, non sull'intero file.
    */
    const corpo = route.match(/async function allineaAttivitaDalFile[\s\S]*?\n}/)?.[0] ?? '';
    expect(corpo).not.toBe('');
    expect(corpo).toMatch(/\.eq\('committente', COMMITTENTE_ALLINEABILE\)/);
    expect(corpo).not.toMatch(/lim_massive/);
  });

  it('il registro si ricalcola col motore condiviso quando qualcosa è cambiato', () => {
    // Il registro è DERIVATO: senza questo, una riapertura riallineata resterebbe a magazzino
    // fino al prossimo Ricalcola a mano.
    expect(route).toMatch(/from '@\/lib\/misuratori\/sincronizzaRegistro'/);
    expect(route).toMatch(/sincronizzaRegistro\(COMMESSA_ACEA\)/);
  });

  it('le righe riscritte si contano e si dicono', () => {
    // Stesso patto degli esiti corretti: l'import scrive sopra a un campo nostro, quindi il
    // riepilogo lo dichiara. Un numero taciuto è la magia che fa perdere fiducia nel registro.
    expect(route).toMatch(/attivitaAllineate/);
    expect(route).toMatch(/registroMisuratori/);
  });
});

describe('migration di recupero — stesse regole del codice', () => {
  it('non tocca il canale massive', () => {
    expect(migration).toMatch(/committente = 'acea'/);
    expect(migration).not.toMatch(/committente in \('acea', ?'lim_massive'\)/);
  });

  it('allinea solo gli ODL su cui il file non si contraddice', () => {
    // `min(chiave) = max(chiave)` è il modo SQL di dire "una sola attività per ordine".
    expect(migration).toMatch(/having min\(chiave\) = max\(chiave\)/);
  });

  it('scrive la canonica di tassonomia, mai il testo grezzo del file', () => {
    expect(migration).toMatch(/join public\.attivita_tassonomia t/);
    expect(migration).toMatch(/a\.descrizione as tipo_nuovo/);
    expect(migration).toMatch(/set intervento_tipo = b\.tipo_nuovo/);
  });

  it("il predicato SQL del registro dice le stesse tre cose di `isRimozioneTipo`", () => {
    // Il gate TS è la fonte; qui si verifica che la trascrizione non ne abbia perso un pezzo.
    expect(gate).toMatch(/ABUSIVO_RE = \/abusiv\/i/);
    expect(gate).toMatch(/RIMOZIONE_RE = \/\\brimoz\|\\brim\\b\/i/);
    expect(migration).toMatch(/~ 'ABUSIV'/);
    expect(migration).toMatch(/RIMOZ/);
    expect(migration).toMatch(/RIM\(\[\^A-Z\]\|\$\)/);
  });

  it('lascia in piedi un backup da tutt\'e due i lati', () => {
    expect(migration).toMatch(/create table if not exists public\.bak_attivita_da_import_20260804_int/);
    expect(migration).toMatch(/create table if not exists public\.bak_attivita_da_import_20260804_reg/);
  });
});
