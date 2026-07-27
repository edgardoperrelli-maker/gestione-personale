import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// La SARACINESCA di AcquaLatina prende da ACEA la FORMA del controllo — gli stessi
// operatori incontrano la stessa lavorazione sui due committenti, e una crocetta di qua
// contro un menu di là è un invito all'errore — ma NON la parola: l'etichetta resta
// quella del capitolato AcquaLatina. La confusione da evitare stava nel controllo, non
// nel nome. Il test tiene separate le due cose, perché sono due decisioni diverse.
//
// Il test legge la migrazione invece del database: gira in CI senza credenziali, e
// controlla ciò che viene versionato — se qualcuno cambia il template a mano in
// produzione senza migrazione, quel disallineamento è un problema di processo che
// questo test non può e non deve mascherare.

const SQL = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260727160000_acqualatina_saracinesca_come_acea.sql'),
  'utf8',
);

/** Forma del controllo ACEA, dai suoi template attivi (LIMITAZIONI/SOSPENSIONI, LIM MASSIVE). */
const ACEA = { tipo: 'select', opzione: 'SI' };
/** Parola del capitolato AcquaLatina: è quella che l'ufficio usa. */
const ETICHETTA = 'SARACINESCA';

describe('SARACINESCA AcquaLatina — allineata alla forma ACEA', () => {
  it('è un select, non una crocetta', () => {
    expect(SQL).toMatch(/'tipo',\s*'select'/);
    // La riga vecchia era `"tipo":"crocetta"`: deve comparire solo nella guardia
    // di idempotenza della WHERE, mai come valore scritto.
    const scritture = SQL.match(/'tipo',\s*'crocetta'/g) ?? [];
    expect(scritture, 'la crocetta non deve essere più scritta').toEqual([]);
  });

  it("tiene l'etichetta del capitolato, NON il nome ACEA della stessa lavorazione", () => {
    expect(SQL).toMatch(new RegExp(`'etichetta',\\s*'${ETICHETTA}'`));
    expect(SQL).not.toMatch(/'etichetta',\s*'SOSTITUZIONE VALVOLA'/);
  });

  it('ha la stessa opzione singola dei template ACEA prevalenti', () => {
    expect(SQL).toMatch(new RegExp(`jsonb_build_array\\('${ACEA.opzione}'\\)`));
  });

  it('NON cambia la chiave: ci punta listino.azione_chiave della riga extra', () => {
    expect(SQL).toMatch(/'chiave',\s*'saracinesca'/);
    expect(SQL).not.toMatch(/'chiave',\s*'sostituzione_valvola'/);
  });

  it("non tocca l'esito: la chiave non è né negativa né il select d'esito", () => {
    // Le due regex vive in utils/rapportini/voceColore.ts.
    const NEG = /assent|non[\s_-]*eseguit|negativ|\bko\b/i;
    const ESITO = /esegu|esito/i;
    const campo = `saracinesca ${ETICHETTA}`;
    expect(NEG.test(campo), 'renderebbe negativa la voce').toBe(false);
    expect(ESITO.test(campo), "verrebbe scambiata per il select d'esito").toBe(false);
  });

  it('la guardia è CONVERGENTE, non «è ancora una crocetta»', () => {
    // Una guardia sullo stato di partenza è idempotente ma non correttiva: rieseguita
    // non sistemerebbe uno stato intermedio. Qui è servito davvero, per rimettere
    // l'etichetta di capitolato dopo un primo giro che l'aveva allineata al nome ACEA.
    expect(SQL).toMatch(/AND NOT campi @>/);
    expect(SQL).toContain('"etichetta": "SARACINESCA"');
    expect(SQL).not.toMatch(/AND campi @> '\[\{"chiave": "saracinesca", "tipo": "crocetta"/);
  });

  it('preserva ordine e numero dei campi (ricostruisce l\'array, non lo sostituisce)', () => {
    expect(SQL).toMatch(/jsonb_agg\([\s\S]*ORDER BY \(c->>'ordine'\)::int/);
    expect(SQL).toMatch(/ELSE c\b/); // gli altri 5 campi passano intatti
  });
});
