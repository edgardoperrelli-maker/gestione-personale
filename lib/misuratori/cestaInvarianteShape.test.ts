import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  L'invariante «cesta valorizzata ⟹ stato almeno scaricato_deposito» (mai il contrario: righe
  scaricato_deposito senza cesta restano legittime) vive nel CODICE, non nel DB: nessun CHECK,
  nessun trigger (spec §8). Questi sono i guardiani di forma sui punti dove si potrebbe rompere di
  nuovo — il comportamento vero sta in cestaStato.ts, che è puro e ha i suoi test. Stesso mestiere
  di palletCellaShape.test.ts.
*/

const registro = readFileSync(resolve(__dirname, './registro.ts'), 'utf8');
const scarico = readFileSync(resolve(__dirname, '../acqualatina/scaricoMisuratori.ts'), 'utf8');

/** I commenti si tolgono PRIMA di cercare: qui si spiegano le regole citandole per esteso. */
const senzaCommenti = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe("la PATCH d'ufficio tiene l'invariante", () => {
  it('la scrittura della cesta passa da statoDopoCesta', () => {
    expect(registro).toMatch(/from '\.\/cestaStato'/);
    expect(senzaCommenti(registro)).toMatch(/statoDopoCesta\(/);
  });

  it("lo stato implicito nasce nel ramo della CESTA e non passa dal gate admin_plus", () => {
    // Chi può scrivere la cesta può disfare la propria scrittura: chiedere un admin per
    // annullare un gesto appena fatto lascerebbe il buco aperto nel frattempo (spec §2).
    const ramoCesta = senzaCommenti(registro).match(/if \('cesta' in body\)[\s\S]*?statoDopoCesta/)?.[0] ?? '';
    expect(ramoCesta).not.toBe('');
    expect(ramoCesta).not.toMatch(/admin_plus/);
  });

  it('lo stato ESPLICITO vince su quello implicito', () => {
    // Senza la guardia un corpo con stato e cesta insieme avrebbe due padroni, e a vincere
    // sarebbe stato l'ultimo ramo scritto, cioè il caso (spec §5).
    // Il prefisso della condizione non si pinna: dal 2026-08-04 la guardia convive con il gate
    // `invarianteCesta` nella stessa `if`, e cercarne la forma esatta rendeva questo test un
    // ostacolo a ogni riscrittura invece che una difesa della regola.
    expect(senzaCommenti(registro)).toMatch(/!\('stato' in patch\)/);
  });

  it('la regressione esplicita azzera la cesta, e solo su AcquaLatina', () => {
    // Il numero rimasto su una riga «da consegnare» è per definizione falso: si è appena
    // dichiarato che quel contatore NON è in deposito (spec §3).
    const src = senzaCommenti(registro);
    expect(src).toMatch(/patch\.stato === 'da_consegnare_deposito'/);
    expect(src).toMatch(/tabella === 'acqualatina_misuratori_rimossi'/);
  });

  it('la risposta porta i campi che il server ha deciso da sé', () => {
    // Il registro NON rifà la fetch sul successo: senza l'eco la colonna Stato resterebbe
    // quella vecchia a schermo.
    const src = senzaCommenti(registro);
    expect(src).toMatch(/risposta\.stato = patch\.stato/);
    expect(src).toMatch(/risposta\.cesta = patch\.cesta/);
  });

  it("l'invariante è gated su AcquaLatina, non lasciato al caso", () => {
    /*
      Il 400 «cesta non prevista su questo registro» era la difesa GRATUITA: ACEA la colonna non
      ce l'aveva. Dal 2026-08-04 (PR #222, `pallet` fuso in `cesta`) ce l'hanno entrambi, quindi
      il discriminante va scritto a mano — e se questo flag sparisse, l'invariante farebbe
      avanzare gli stati anche su ACEA, dove nessuno scarica niente.
      Il comportamento vero è provato in registroCesta.test.ts (caso 7).
    */
    const src = senzaCommenti(registro);
    expect(src).toMatch(/const invarianteCesta = tabella === 'acqualatina_misuratori_rimossi'/);
    expect(src).toMatch(/if \(invarianteCesta && !\('stato' in patch\)\)/);
    expect(src).toMatch(/if \(invarianteCesta && patch\.stato === 'da_consegnare_deposito'\)/);
  });
});

describe('il bacino della modale operatore resta filtrato per STATO', () => {
  it('misuratoriDaScaricare non filtra per cesta', () => {
    /*
      La decisione più facile da rovesciare per sbaglio leggendo solo il titolo della spec (§6).
      Un filtro `cesta IS NULL` seppellirebbe la riga incoerente esattamente come il buco che la
      spec chiude: se quella coppia si riformasse, la riga DEVE tornare nella modale.
    */
    const query = scarico.match(/export async function misuratoriDaScaricare[\s\S]*?\n\}/)?.[0] ?? '';
    expect(query).not.toBe('');
    expect(query).toMatch(/\.eq\('stato', DA_SCARICARE\)/);
    expect(senzaCommenti(query)).not.toMatch(/\.is\('cesta'/);
  });
});

describe("il registro d'ufficio mostra quello che il server ha deciso", () => {
  const client = readFileSync(
    resolve(__dirname, '../../components/modules/misuratori/MisuratoriClient.tsx'),
    'utf8',
  );

  it("l'eco della PATCH si fonde nella riga", () => {
    // Senza il merge la colonna Stato resterebbe quella vecchia: l'ottimistica applica solo
    // i campi che il CLIENT ha mandato, e lo stato implicito non è fra quelli.
    const src = senzaCommenti(client);
    expect(src).toMatch(/eco\.stato !== undefined/);
    expect(src).toMatch(/eco\.cesta !== undefined/);
  });

  it('il toast dell\'implicazione scatta solo su una PATCH che chiedeva la CESTA', () => {
    // Se l'ufficio ha mosso lo stato dalla tendina, annunciarglielo è rumore: l'ha appena
    // fatto di proposito.
    const src = senzaCommenti(client);
    expect(src).toMatch(/patch\.cesta !== undefined && eco\.stato === 'scaricato_deposito'/);
    expect(src).toMatch(/patch\.cesta !== undefined && eco\.stato === 'da_consegnare_deposito'/);
  });

  it('il toast della regressione esplicita scatta solo se la riga aveva già una cesta', () => {
    // `cestaPrima` evita di annunciare una rimozione su una riga che una cesta non l'aveva mai
    // avuta: senza la guardia ogni regressione di stato dalla tendina mostrerebbe «cesta tolta».
    const src = senzaCommenti(client);
    expect(src).toMatch(/patch\.stato !== undefined && eco\.cesta === null && cestaPrima/);
  });
});
