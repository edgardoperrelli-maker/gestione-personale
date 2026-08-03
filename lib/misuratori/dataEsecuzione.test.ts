import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `data_esecuzione` del registro misuratori è la GIORNATA DI LAVORO, non l'istante in cui la
 * voce è stata toccata. Derivarla da `updated_at`/`chiuso_at` faceva sì che riaprire un
 * rapportino e rispedirlo spostasse tutte le sue rimozioni al giorno della rispedizione —
 * il 03/08 sono così finite nel registro 39 rimozioni del 31/07 datate 03/08.
 *
 * I due scrittori devono restare d'accordo: se uno solo torna a `chiuso_at`, il passo di
 * correzione del sync riscrive a ogni giro la data buona con quella sbagliata, e nessuna
 * correzione a mano sopravvive.
 */

const radice = resolve(__dirname, '../..');
const leggi = (p: string) => readFileSync(resolve(radice, p), 'utf8');

const INVIA = leggi('app/api/r/[token]/invia/route.ts');
const SYNC = leggi('lib/misuratori/sincronizzaRegistro.ts');
const MIGRAZIONE = leggi('supabase/migrations/20260803250000_data_esecuzione_misuratori.sql');

/**
 * Isola la riga che ASSEGNA `data_esecuzione`, scartando la dichiarazione di tipo
 * (`data_esecuzione: string;`) e i commenti che la spiegano.
 */
function assegnazione(sorgente: string): string {
  const riga = sorgente
    .split('\n')
    .find((l) => /^\s*data_esecuzione:/.test(l) && !/:\s*string;\s*$/.test(l));
  expect(riga, 'assegnazione di data_esecuzione non trovata').toBeTruthy();
  return riga!;
}

describe("l'invio del rapportino data le rimozioni sulla giornata di lavoro", () => {
  it('prende la data dall intervento, non dall istante della voce', () => {
    const riga = assegnazione(INVIA);
    expect(riga).toContain('dataMap.get');
    expect(riga).not.toContain('updated_at');
  });

  it('carica la data insieme agli altri metadati intervento', () => {
    expect(INVIA).toMatch(/select\('id, committente, intervento_tipo, odl, data'\)/);
  });
});

describe('il sync del registro non riporta indietro la correzione', () => {
  it('costruisce dataEsecuzione da `data`, non da `chiuso_at`', () => {
    const blocco = SYNC.match(/const dataEsecuzione = new Map\([\s\S]*?\);/);
    expect(blocco).toBeTruthy();
    expect(blocco![0]).toContain('i.data');
    expect(blocco![0]).not.toContain('chiuso_at');
  });
});

describe('la bonifica delle righe già scritte', () => {
  it('riallinea entrambi i registri partendo da interventi.data', () => {
    for (const tabella of ['acqualatina_misuratori_rimossi', 'misuratori_rimossi']) {
      expect(MIGRAZIONE).toMatch(
        new RegExp(`update public\\.${tabella}[\\s\\S]*?set data_esecuzione = i\\.data`),
      );
    }
  });

  it('non tocca le righe senza intervento: non avrebbero una giornata da cui ripartire', () => {
    // Il join su `interventi` è ciò che le esclude: senza, il `set` girerebbe a vuoto o peggio.
    expect(MIGRAZIONE).toMatch(/from public\.interventi i[\s\S]*?where i\.id = m\.intervento_id/);
  });
});
